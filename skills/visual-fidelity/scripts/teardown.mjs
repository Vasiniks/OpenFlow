#!/usr/bin/env node
// teardown.mjs — reverse-engineer a reference site: what it shows, how it moves, and HOW it's built.
// Usage: vf teardown <url> --out <dir> [--pages 6] [--viewport 1440x900] [--no-video] [--no-assets] [--steps 28]
//
// Produces <out>/teardown.md (read this first) + JSON + evidence:
//   intro/ (frames 0–5 s after load + intro.webm), scroll-sheet-*.png (contact sheets of one continuous scroll),
//   steps/ (screenshot per scroll step), motion.json (scroll-linked / reveal / pinned elements with timing + easing),
//   hover.json (hover diffs + custom cursor), states/ (menu, tabs), pages/ (other routes), stack.json (libraries from
//   runtime + bundle analysis: eases, durations, ScrollTrigger configs), three.json (live three.js scene: lights,
//   materials, tone mapping), shaders/ (every GLSL program compiled), assets/ (fonts, models, HDRIs, lottie, rive,
//   largest images) + assets.json.
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const url = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
if (!url || url.startsWith("--")) { console.error("usage: teardown <url> --out <dir> [--pages 6] [--viewport 1440x900] [--no-video] [--no-assets] [--steps 28]"); process.exit(2); }
const OUT = opt("out", "./teardown");
const [VW, VH] = opt("viewport", "1440x900").split("x").map(Number);
const MAX_PAGES = Number(opt("pages", "6")), MAX_STEPS = Number(opt("steps", "28"));
const VIDEO = !flag("no-video"), ASSETS = !flag("no-assets");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
for (const d of ["intro", "steps", "states", "pages", "shaders", "assets"]) mkdirSync(join(OUT, d), { recursive: true });
const log = (s) => console.error(`[teardown] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (f, o) => writeFileSync(join(OUT, f), typeof o === "string" ? o : JSON.stringify(o, null, 1));

// ------------------------------------------------------------------------------------------------ page hooks
// Installed before any site code runs: capture GLSL, the live three.js scene/renderer, canvas context types, rAF rate.
const INIT = `(() => {
  const S = (window.__td = { shaders: [], three: { scenes: [], renderers: [] }, raf: 0 });
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const o = C.prototype.shaderSource;
    C.prototype.shaderSource = function (sh, src) { try { if (S.shaders.length < 300 && !S.shaders.includes(src)) S.shaders.push(src); } catch (e) {} return o.call(this, sh, src); };
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, a) { const c = gc.call(this, t, a); if (c) this.__tdCtx = t; return c; };
  try {
    const et = new EventTarget();
    et.addEventListener('observe', (e) => { const o = e.detail; if (!o) return; if (o.isScene) S.three.scenes.push(o); else if (o.domElement && o.render) S.three.renderers.push(o); });
    Object.defineProperty(window, '__THREE_DEVTOOLS__', { value: et, configurable: true });
  } catch (e) {}
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { S.raf++; return raf(cb); };
})();`;

// ------------------------------------------------------------------------------------------------ in-page probes
function pageStack() {
  const w = window, d = document, html = d.documentElement, q = (s) => d.querySelector(s), qa = (s) => [...d.querySelectorAll(s)];
  const libs = {};
  if (w.gsap) libs.gsap = w.gsap.version || "global";
  const gsapEls = qa("*").filter((e) => e._gsap).length; if (gsapEls) libs.gsap_animated_elements = gsapEls;
  const pins = qa(".pin-spacer").length;
  if (w.ScrollTrigger || pins) libs.scrolltrigger = { pins, triggers: w.ScrollTrigger?.getAll?.().map((t) => ({ trigger: t.trigger?.className?.toString().slice(0, 60), start: t.start, end: t.end, pin: !!t.pin, scrub: t.vars?.scrub })).slice(0, 40) };
  if (html.classList.contains("lenis") || w.lenis || w.Lenis) libs.lenis = true;
  if (html.classList.contains("has-scroll-smooth") || q("[data-scroll-container]")) libs.locomotive = true;
  if (w.barba || q("[data-barba]")) libs.barba = true;
  if (w.swup || q("#swup")) libs.swup = true;
  if (q("[data-taxi]")) libs.taxi = true;
  if (w.__THREE__) libs.three = "r" + w.__THREE__;
  if (w.PIXI) libs.pixi = w.PIXI.VERSION || true;
  if (q("spline-viewer")) libs.spline = true;
  if (w.lottie || w.bodymovin || q("lottie-player,dotlottie-player,dotlottie-wc")) libs.lottie = true;
  if (q("[data-wf-page]")) libs.webflow = true;
  if (q("[data-framer-name],[data-framer-component-type]")) libs.framer = true;
  if (q(".swiper")) libs.swiper = true;
  if (w.Howler || w.Howl) libs.howler_sound = true;
  const split = qa("h1,h2,h3,h4,p,a,span,div").filter((e) => e.children.length >= 4 && [...e.children].every((c) => /(^|[\s_-])(char|word|line|split)/i.test(c.className?.toString() || "") || c.textContent.trim().length <= 1)).length;
  if (split) libs.split_text_blocks = split;
  const canvases = qa("canvas").map((c) => { const r = c.getBoundingClientRect(); return { ctx: c.__tdCtx || "none", w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), fixed: getComputedStyle(c).position === "fixed" }; });
  const videos = qa("video").map((v) => ({ src: (v.currentSrc || v.src || "").slice(0, 160), autoplay: v.autoplay, loop: v.loop, muted: v.muted, w: Math.round(v.getBoundingClientRect().width) }));
  const fonts = [...d.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight} ${f.style}`);
  const cursor = getComputedStyle(d.body).cursor;
  return { libs, canvases, videos, fonts: [...new Set(fonts)], bodyCursor: cursor, docHeight: d.documentElement.scrollHeight, title: d.title, rafCallsSoFar: w.__td?.raf };
}

function threeScene() {
  const T = window.__td?.three; if (!T || (!T.scenes.length && !T.renderers.length)) return null;
  const hex = (c) => (c && c.getHexString ? "#" + c.getHexString() : undefined);
  const TM = { 0: "None", 1: "Linear", 2: "Reinhard", 3: "Cineon", 4: "ACESFilmic", 5: "Custom", 6: "AgX", 7: "Neutral" };
  const renderers = T.renderers.slice(0, 4).map((r) => ({ toneMapping: TM[r.toneMapping] ?? r.toneMapping, exposure: r.toneMappingExposure, colorSpace: r.outputColorSpace, shadows: r.shadowMap?.enabled, shadowType: r.shadowMap?.type, pixelRatio: r.getPixelRatio?.(), size: r.domElement ? [r.domElement.width, r.domElement.height] : null, info: r.info ? { calls: r.info.render?.calls, triangles: r.info.render?.triangles, textures: r.info.memory?.textures, geometries: r.info.memory?.geometries, programs: r.info.programs?.length } : null }));
  const scenes = T.scenes.slice(0, 6).map((s) => {
    const counts = {}, meshes = [], lights = [], mats = new Map();
    s.traverse((o) => {
      counts[o.type] = (counts[o.type] || 0) + 1;
      if (o.isLight && lights.length < 20) lights.push({ type: o.type, color: hex(o.color), intensity: o.intensity, pos: o.position?.toArray().map((v) => +v.toFixed(2)), castShadow: o.castShadow, ground: hex(o.groundColor) });
      if (o.isMesh || o.isPoints || o.isLine) {
        const g = o.geometry; const verts = g?.attributes?.position?.count || 0;
        if (meshes.length < 30) meshes.push({ name: o.name || undefined, type: o.type, geometry: g?.type, verts, instanced: o.isInstancedMesh ? o.count : undefined, material: [].concat(o.material).map((m) => m?.type).join(",") });
        for (const m of [].concat(o.material)) if (m && !mats.has(m.uuid) && mats.size < 25) mats.set(m.uuid, {
          type: m.type, name: m.name || undefined, color: hex(m.color), emissive: hex(m.emissive), emissiveIntensity: m.emissiveIntensity, roughness: m.roughness, metalness: m.metalness,
          transmission: m.transmission, thickness: m.thickness, ior: m.ior, clearcoat: m.clearcoat, iridescence: m.iridescence, sheen: m.sheen, envMapIntensity: m.envMapIntensity,
          maps: ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "lightMap", "emissiveMap", "alphaMap", "envMap", "displacementMap"].filter((k) => m[k]),
          transparent: m.transparent || undefined, blending: m.blending !== 1 ? m.blending : undefined, side: m.side, wireframe: m.wireframe || undefined,
          uniforms: m.uniforms ? Object.keys(m.uniforms).slice(0, 20) : undefined, customShader: !!(m.fragmentShader && m.vertexShader),
        });
      }
    });
    return { name: s.name || undefined, background: s.background ? (s.background.isColor ? hex(s.background) : s.background.isTexture ? "texture" : typeof s.background) : null,
      environment: s.environment ? "texture (" + (s.environment.mapping || "?") + ")" : null, fog: s.fog ? { type: s.fog.type || (s.fog.density ? "FogExp2" : "Fog"), color: hex(s.fog.color), near: s.fog.near, far: s.fog.far, density: s.fog.density } : null,
      counts, lights, meshes, materials: [...mats.values()] };
  });
  return { renderers, scenes };
}

// Candidates for the motion map: salient elements, tagged with data-td indexes.
function tagCandidates(limit) {
  const vw = innerWidth, vh = innerHeight, out = [];
  let i = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (out.length >= limit) break;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 8 || r.height < 8 || cs.display === "none") continue;
    const tag = el.tagName.toLowerCase(), area = (r.width * r.height) / (vw * vh);
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim();
    const media = ["img", "video", "canvas", "svg", "picture"].includes(tag);
    const heading = /^h[1-3]$/.test(tag) || (text.length > 2 && parseFloat(cs.fontSize) >= 28);
    const block = area >= 0.04 && ["section", "div", "article", "figure", "li", "a", "header", "footer", "main"].includes(tag);
    const splitChild = el.parentElement && el.parentElement.children.length >= 4 && el.textContent.trim().length <= 20 && /(char|word|line|split)/i.test((el.className || "").toString());
    if (!(media || heading || block || (splitChild && out.filter((o) => o.split).length < 60) || (text.length > 20 && area > 0.004))) continue;
    el.setAttribute("data-td", String(i));
    out.push({ i, tag, split: !!splitChild, text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 48), cls: (el.className?.toString() || "").slice(0, 60) });
    i++;
  }
  return out;
}
function sampleCandidates() {
  const vh = innerHeight, res = {};
  for (const el of document.querySelectorAll("[data-td]")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    res[el.getAttribute("data-td")] = [Math.round(r.top), Math.round(r.left), Math.round(r.height), cs.transform === "none" ? "" : cs.transform, +(+cs.opacity).toFixed(3),
      cs.clipPath === "none" ? "" : cs.clipPath, cs.filter === "none" ? "" : cs.filter, r.bottom > 0 && r.top < vh ? 1 : 0,
      // fixed UI = element or a SMALL ancestor is position:fixed (a full-screen fixed wrapper is a virtual scroller, not UI)
      (() => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (getComputedStyle(e).position === "fixed") { const b = e.getBoundingClientRect(); return b.width * b.height < innerWidth * innerHeight * 0.6 ? "fixed" : cs.position; } } return cs.position; })()];
  }
  return { sy: Math.round(scrollY), res };
}

// ------------------------------------------------------------------------------------------------ analysis helpers
const parseMatrix = (m) => {
  if (!m) return { tx: 0, ty: 0, s: 1, r: 0 };
  const v = m.match(/matrix(3d)?\(([^)]+)\)/); if (!v) return { tx: 0, ty: 0, s: 1, r: 0 };
  const n = v[2].split(",").map(Number);
  if (v[1]) return { tx: n[12], ty: n[13], s: Math.hypot(n[0], n[1], n[2]), r: Math.atan2(n[1], n[0]) * 57.3 };
  return { tx: n[4], ty: n[5], s: Math.hypot(n[0], n[1]), r: Math.atan2(n[1], n[0]) * 57.3 };
};
const EASES = { linear: (t) => t, "power1.out": (t) => 1 - (1 - t) ** 2, "power2.out": (t) => 1 - (1 - t) ** 3, "power3.out": (t) => 1 - (1 - t) ** 4, "power4.out": (t) => 1 - (1 - t) ** 5,
  "expo.out": (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)), "power2.inOut": (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), "power3.inOut": (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2) };
// Fit (duration, ease) to progress samples [(ms, 0..1)] taken after an element started animating.
function fitEase(samples) {
  let best = null;
  for (const dur of [300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 2000]) for (const [name, f] of Object.entries(EASES)) {
    const err = samples.reduce((a, [t, p]) => a + (f(Math.min(1, t / dur)) - p) ** 2, 0);
    if (!best || err < best.err) best = { dur, ease: name, err };
  }
  return best && best.err < 0.15 ? { duration_ms: best.dur, ease: best.ease } : null;
}

// ------------------------------------------------------------------------------------------------ bundle analysis
const KEYWORDS = ["gsap", "ScrollTrigger", "SplitText", "Flip", "DrawSVG", "MorphSVG", "CustomEase", "Observer", "ScrollSmoother", "Lenis", "locomotive", "barba", "swup", "taxi", "THREE", "WebGLRenderer", "ShaderMaterial", "RawShaderMaterial", "EffectComposer", "UnrealBloomPass", "@react-three", "postprocessing", "ogl", "curtains", "pixi", "matter", "howler", "theatre", "lottie", "rive", "swiper", "embla", "splitting", "gl_FragColor", "gl_FragCoord", "simplex", "snoise", "fbm", "curlNoise", "MeshTransmissionMaterial", "MeshPhysicalMaterial", "RGBELoader", "HDRLoader", "DRACOLoader", "KTX2Loader", "GLTFLoader", "InstancedMesh", "Points", "requestAnimationFrame", "IntersectionObserver", "clip-path", "mix-blend-mode", "View Transition"];
function analyzeBundles(texts) {
  const all = texts.join("\n");
  const hits = Object.fromEntries(KEYWORDS.map((k) => [k, (all.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\@]/g, "\\$&"), "g")) || []).length]).filter(([, n]) => n));
  const count = (re) => { const m = {}; for (const x of all.matchAll(re)) m[x[1]] = (m[x[1]] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15); };
  return {
    keyword_hits: hits,
    gsap_eases: count(/ease\s*:\s*["'`]([\w.()\-, ]{3,40})["'`]/g),
    durations: count(/duration\s*:\s*([\d.]+)/g),
    staggers: count(/stagger\s*:\s*([\d.]+|\{[^}]{0,60}\})/g),
    scroll_starts: count(/start\s*:\s*["'`]([^"'`]{3,30})["'`]/g),
    scroll_ends: count(/end\s*:\s*["'`]([^"'`]{3,30})["'`]/g),
    scrub_values: count(/scrub\s*:\s*([\d.]+|!0|true)/g),
    css_eases: count(/(cubic-bezier\([^)]+\))/g),
    lenis_options: [...all.matchAll(/new\s+\w+\(\{[^}]{0,200}(lerp|duration|smoothWheel|wheelMultiplier)[^}]{0,200}\}/g)].slice(0, 3).map((m) => m[0].slice(0, 260)),
    scrolltrigger_snippets: [...all.matchAll(/scrollTrigger\s*:\s*\{[^}]{0,260}\}/g)].slice(0, 12).map((m) => m[0].replace(/\s+/g, " ")),
  };
}

// ------------------------------------------------------------------------------------------------ main
const origin = new URL(url).origin;
const browser = await chromium.launch({ headless: true, args: ["--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"] });
const ctxOpts = (video) => ({ viewport: { width: VW, height: VH }, userAgent: UA, deviceScaleFactor: 1, ...(video && VIDEO ? { recordVideo: { dir: join(OUT, "_video"), size: { width: VW, height: VH } } } : {}) });

const bundleTexts = [], assets = new Map();
function watchNetwork(page) {
  page.on("response", async (res) => {
    try {
      const u = res.url(), ct = (res.headers()["content-type"] || "").toLowerCase(), len = +(res.headers()["content-length"] || 0);
      if (!u.startsWith("http")) return;
      const ext = extname(new URL(u).pathname).toLowerCase();
      if ((ct.includes("javascript") || ext === ".js" || ext === ".mjs") && bundleTexts.length < 60) { const t = await res.text(); if (t.length < 6e6) bundleTexts.push(t); return; }
      if (ct.includes("css") || ext === ".css") { bundleTexts.push(await res.text()); return; }
      let kind = null;
      if (/font|woff|ttf|otf/.test(ct) || [".woff", ".woff2", ".ttf", ".otf"].includes(ext)) kind = "font";
      else if ([".glb", ".gltf", ".bin", ".drc", ".ktx2", ".basis", ".obj", ".fbx", ".usdz"].includes(ext)) kind = "model";
      else if ([".hdr", ".exr", ".env"].includes(ext)) kind = "hdri";
      else if (ext === ".riv") kind = "rive";
      else if (ext === ".json" && (u.includes("lottie") || len > 5000)) kind = "json";
      else if (ct.startsWith("image/")) kind = "image";
      else if (ct.startsWith("video/") || [".mp4", ".webm", ".mov", ".m3u8"].includes(ext)) kind = "video";
      else if (ct.startsWith("audio/") || [".mp3", ".ogg", ".wav"].includes(ext)) kind = "audio";
      if (!kind || assets.has(u)) return;
      const entry = { url: u, kind, type: ct.split(";")[0], bytes: len || undefined };
      assets.set(u, entry);
      if (ASSETS && ["font", "model", "hdri", "rive", "json"].includes(kind) || (ASSETS && kind === "image" && (len > 60000))) {
        const buf = await res.body().catch(() => null);
        if (!buf) return;
        entry.bytes = buf.length;
        if (kind === "json" && !/"layers"\s*:/.test(buf.slice(0, 20000).toString())) { assets.delete(u); return; }  // keep only Lottie JSON
        const cext = ext || ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg", "image/gif": ".gif", "font/woff2": ".woff2", "font/woff": ".woff" }[entry.type] || "");
        const name = `${kind}-${createHash("sha1").update(u).digest("hex").slice(0, 8)}${cext}`;
        writeFileSync(join(OUT, "assets", name), buf); entry.saved = `assets/${name}`;
      }
    } catch {}
  });
}

// ---- 1. intro: load sequence (preloader, hero entrance)
log(`intro ${url}`);
let introReadyMs = 0;
{
  const ctx = await browser.newContext(ctxOpts(true)); await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); watchNetwork(page);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit", timeout: 60000 }).catch((e) => log(`goto: ${e.message}`));
  let prevSize = 0;
  for (const t of [300, 700, 1200, 1800, 2600, 3600, 5000, 7000]) {
    await sleep(Math.max(0, t - (Date.now() - t0)));
    const buf = await page.screenshot({ path: join(OUT, "intro", `t${String(t).padStart(4, "0")}ms.jpg`), quality: 70, type: "jpeg" }).catch(() => null);
    // first frame that is clearly "content" (much bigger than the blank/preloader frames) ≈ when the intro is done
    if (buf && !introReadyMs && buf.length > Math.max(20000, prevSize * 2.5)) introReadyMs = t;
    if (buf) prevSize = Math.max(prevSize, buf.length);
  }
  await ctx.close();
  if (VIDEO) { const v = readdirSync(join(OUT, "_video")).find((f) => f.endsWith(".webm")); if (v) renameSync(join(OUT, "_video", v), join(OUT, "intro", "intro.webm")); rmSync(join(OUT, "_video"), { recursive: true, force: true }); }
}

// ---- 2. main pass: stack, three.js, shaders, motion map by scroll steps, hovers, cursor, states, links
log("main pass");
const ctx = await browser.newContext(ctxOpts(false)); await ctx.addInitScript(INIT);
const page = await ctx.newPage(); watchNetwork(page);
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() => page.waitForTimeout(8000));
await sleep(Math.max(4000, introReadyMs + 1500));
const stack0 = await page.evaluate(pageStack);
const raf0 = await page.evaluate(() => window.__td?.raf || 0); await sleep(1000);
const rafPerSec = (await page.evaluate(() => window.__td?.raf || 0)) - raf0;
const cands = await page.evaluate(tagCandidates, 320);
const samples = [];
const stepPx = Math.round(VH * 0.5);
let stuck = 0, wheelTravel = 0;
const pageMoved = [true];  // pageMoved[s] = content moved between step s-1 and s
for (let s = 0; s < MAX_STEPS; s++) {
  const series = [];
  for (const t of [0, 250, 600, 1100]) { if (t) await sleep(t - (series.length ? [0, 250, 600, 1100][series.length - 1] : 0)); series.push({ t, ...(await page.evaluate(sampleCandidates)) }); }
  samples.push(series);
  await page.screenshot({ path: join(OUT, "steps", `s${String(s).padStart(2, "0")}.jpg`), quality: 62, type: "jpeg" }).catch(() => {});
  // wheel like a person (works with Lenis/Locomotive/virtual scrollers, unlike scrollTo)
  await page.mouse.move(VW / 2, VH / 2);
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, stepPx / 8); await sleep(30); }
  await sleep(500);
  // "did the page move?" measured on content, not scrollY, so virtual scrollers (transform-based) work too
  const nowTops = (await page.evaluate(sampleCandidates)).res;
  const prevTops = series[series.length - 1].res;
  const deltas = Object.keys(nowTops).map((k) => Math.abs(nowTops[k][0] - (prevTops[k]?.[0] ?? nowTops[k][0])));
  const moved = deltas.filter((d) => d > 20).length / Math.max(1, deltas.length) > 0.15;
  pageMoved.push(moved);
  wheelTravel += moved ? stepPx : 0;
  stuck = moved ? 0 : stuck + 1;
  if (stuck >= 2 && s > 1) { samples.push([{ t: 0, ...(await page.evaluate(sampleCandidates)) }]); pageMoved.push(false); break; }
}
const virtualScroll = stack0.docHeight <= VH * 1.2 && wheelTravel > VH;
// motion classification
const motion = { scroll_linked: [], reveals: [], pinned: [], fixed: [] };
const byI = Object.fromEntries(cands.map((c) => [c.i, c]));
for (const c of cands) {
  const k = String(c.i);
  const finals = samples.map((ser) => ser[ser.length - 1].res[k]).filter(Boolean);
  const inView = finals.map((f) => f[7]);
  if (!finals.length) continue;
  if (finals.every((f) => f[8] === "fixed")) { if (finals[0][2] > 20) motion.fixed.push({ el: c.tag, text: c.text, cls: c.cls }); continue; }
  // pinned: visible and top unchanged for ≥2 consecutive steps while the page scrolled
  let pinRun = 0, maxPin = 0;
  for (let s = 1; s < finals.length; s++) { if (inView[s] && inView[s - 1] && Math.abs(finals[s][0] - finals[s - 1][0]) < 3 && pageMoved[s]) { pinRun++; maxPin = Math.max(maxPin, pinRun); } else pinRun = 0; }
  const viewSteps = inView.filter(Boolean).length;
  if (maxPin + 1 >= Math.max(4, viewSteps * 0.8)) { if (finals[0][2] > 20) motion.fixed.push({ el: c.tag, text: c.text, cls: c.cls }); continue; }  // always on screen = fixed UI, not a pin
  if (maxPin >= 2 && finals[0][8] !== "fixed") motion.pinned.push({ el: c.tag, text: c.text, cls: c.cls, steps_pinned: maxPin + 1 });
  // scroll-linked: transform/opacity/clip differ between consecutive in-view steps (after settle), ≥2 times
  let changes = 0;
  const props = new Set();
  for (let s = 1; s < finals.length; s++) {
    if (!inView[s] || !inView[s - 1]) continue;
    const a = finals[s - 1], b = finals[s], ma = parseMatrix(a[3]), mb = parseMatrix(b[3]);
    const d = [];
    if (Math.abs(ma.ty - mb.ty) > 4 || Math.abs(ma.tx - mb.tx) > 4) d.push("translate");
    if (Math.abs(ma.s - mb.s) > 0.01) d.push("scale"); if (Math.abs(ma.r - mb.r) > 0.5) d.push("rotate");
    if (Math.abs(a[4] - b[4]) > 0.05) d.push("opacity"); if (a[5] !== b[5]) d.push("clip-path"); if (a[6] !== b[6]) d.push("filter");
    if (d.length) { changes++; d.forEach((x) => props.add(x)); }
  }
  if (changes >= 2) {
    const tx = finals.filter((_, s) => inView[s]).map((f) => parseMatrix(f[3]));
    motion.scroll_linked.push({ el: c.tag, text: c.text, cls: c.cls, props: [...props], range: { tx: [Math.min(...tx.map((m) => m.tx)), Math.max(...tx.map((m) => m.tx))].map(Math.round), ty: [Math.min(...tx.map((m) => m.ty)), Math.max(...tx.map((m) => m.ty))].map(Math.round), scale: [Math.min(...tx.map((m) => m.s)), Math.max(...tx.map((m) => m.s))].map((v) => +v.toFixed(2)) } });
    continue;
  }
  // reveal: within one step's time series the element animates, then stays put
  for (let s = 0; s < samples.length; s++) {
    const ser = samples[s].map((x) => x.res[k]).filter(Boolean);
    if (ser.length < 3 || !ser[ser.length - 1][7]) continue;
    const val = (f) => { const m = parseMatrix(f[3]); return [m.ty, m.tx, m.s * 100, f[4] * 100, f[5] ? f[5].length : 0]; };
    const v0 = val(ser[0]), vN = val(ser[ser.length - 1]);
    const dist = v0.map((x, j) => Math.abs(x - vN[j]));
    const main = dist.indexOf(Math.max(...dist));
    if (dist[main] < 6) continue;
    const prog = ser.map((f, j) => [samples[s][j].t, 1 - Math.abs(val(f)[main] - vN[main]) / dist[main]]);
    const fromTo = { from: { transform: ser[0][3] || "none", opacity: ser[0][4], clip: ser[0][5] || undefined }, to: { transform: ser[ser.length - 1][3] || "none", opacity: ser[ser.length - 1][4], clip: ser[ser.length - 1][5] || undefined } };
    motion.reveals.push({ el: c.tag, text: c.text, cls: c.cls, split_part: c.split || undefined, at_step: s, prop: ["translateY", "translateX", "scale", "opacity", "clip-path"][main], ...fromTo, timing: fitEase(prog) || "longer than 1.1s or scroll-driven" });
    break;
  }
}
// collapse split-text children into one entry per parent pattern
const splitRev = motion.reveals.filter((r) => r.split_part);
motion.reveals = motion.reveals.filter((r) => !r.split_part);
if (splitRev.length) motion.split_text = { parts_animated: splitRev.length, example: splitRev[0], props: [...new Set(splitRev.map((r) => r.prop))] };

// hover map + custom cursor
log("hover + cursor");
await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.wheel(0, -99999); await sleep(1500);
const hoverTargets = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("a,button,[role=button],[data-cursor],[class*=card],[class*=link],[class*=btn]")) {
    const r = el.getBoundingClientRect(); if (r.width < 20 || r.height < 12 || r.top < 0 || r.bottom > innerHeight) continue;
    el.setAttribute("data-tdh", String(out.length)); out.push({ i: out.length, tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40), x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (out.length >= 24) break;
  }
  return out;
});
const snapHover = (i) => page.evaluate((i) => {
  const el = document.querySelector(`[data-tdh="${i}"]`); if (!el) return null;
  const nodes = [el, ...el.querySelectorAll("*")].slice(0, 25);
  return nodes.map((n) => { const cs = getComputedStyle(n); return [n.tagName.toLowerCase(), cs.transform, cs.opacity, cs.color, cs.backgroundColor, cs.clipPath, cs.filter, cs.textDecorationLine, cs.letterSpacing, cs.borderColor, cs.boxShadow.slice(0, 40), cs.width]; });
}, i);
const hovers = [];
for (const h of hoverTargets) {
  await page.mouse.move(5, VH - 5); await sleep(700);  // let the previous hover-out finish
  const a = await snapHover(h.i); if (!a) continue;
  await page.mouse.move(h.x, h.y, { steps: 6 }); await sleep(550);
  const b = await snapHover(h.i); if (!b) continue;
  const names = ["transform", "opacity", "color", "background", "clip-path", "filter", "underline", "letter-spacing", "border", "shadow", "width"];
  // summarise: group identical property changes across children ("6× child div translateY 0→-31px")
  const groups = new Map();
  const fmt = (name, v) => { if (name !== "transform") return String(v).slice(0, 40); const m = parseMatrix(v === "none" ? "" : v); return `${Math.abs(m.tx) > 0.5 ? `x${Math.round(m.tx)} ` : ""}${Math.abs(m.ty) > 0.5 ? `y${Math.round(m.ty)} ` : ""}${Math.abs(m.s - 1) > 0.01 ? `s${m.s.toFixed(2)} ` : ""}${Math.abs(m.r) > 0.5 ? `r${Math.round(m.r)}° ` : ""}`.trim() || "none"; };
  a.forEach((row, n) => row.slice(1).forEach((v, j) => {
    if (!b[n] || b[n][j + 1] === v) return;
    const from = fmt(names[j], v), to = fmt(names[j], b[n][j + 1]); if (from === to) return;
    const key = `${n ? `child ${row[0]}` : "self"} ${names[j]}: ${from} → ${to}`.replace(/(-?\d+)\.\d+/g, "$1");
    groups.set(key, (groups.get(key) || 0) + 1);
  }));
  const diff = [...groups.entries()].map(([k, c]) => (c > 1 ? `${c}× ${k}` : k));
  if (diff.length) hovers.push({ el: h.tag, text: h.text, changes: diff.slice(0, 5) });
  if (hovers.length === 4) await page.screenshot({ path: join(OUT, "states", "hover-example.jpg"), quality: 70, type: "jpeg" }).catch(() => {});
}
const cursor = await (async () => {
  const pos = async () => page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const cs = getComputedStyle(e); return cs.position === "fixed" && cs.pointerEvents === "none"; }).map((e) => { const r = e.getBoundingClientRect(); return { cls: (e.className?.toString() || e.tagName).slice(0, 50), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), blend: getComputedStyle(e).mixBlendMode }; }));
  await page.mouse.move(200, 200, { steps: 5 }); await sleep(600); const p1 = await pos();
  await page.mouse.move(900, 600, { steps: 8 }); await sleep(600); const p2 = await pos();
  const moved = p2.filter((b) => { const a = p1.find((x) => x.cls === b.cls); return a && Math.hypot(a.x - b.x, a.y - b.y) > 200 && b.w < 400; });
  return moved.length ? { custom_cursor: true, elements: moved.slice(0, 3) } : { custom_cursor: false, css_cursor: stack0.bodyCursor };
})();

// menu / tabs / other states
log("states");
const states = [];
for (const sel of ["button[aria-expanded=false]", "[class*=burger]", "[class*=menu-toggle]", "[class*=menu] button", "[aria-label*=menu i]", "[role=tab]"]) {
  const el = await page.$(sel); if (!el || !(await el.isVisible().catch(() => false))) continue;
  const name = sel.replace(/[^a-z]/gi, "").slice(0, 20);
  await el.click({ timeout: 2000 }).catch(() => {});
  for (const t of [120, 450, 1100]) { await sleep(t === 120 ? 120 : t - (t === 450 ? 120 : 450)); await page.screenshot({ path: join(OUT, "states", `${name}-${t}ms.jpg`), quality: 70, type: "jpeg" }).catch(() => {}); }
  states.push({ trigger: sel, frames: [120, 450, 1100].map((t) => `states/${name}-${t}ms.jpg`) });
  await page.keyboard.press("Escape").catch(() => {}); await el.click({ timeout: 1500 }).catch(() => {}); await sleep(900);
  if (states.length >= 3) break;
}

// runtime evidence first (the transition below navigates away and resets the hooks)
const three = await page.evaluate(threeScene).catch(() => null);
const shaders = await page.evaluate(() => window.__td?.shaders || []);
const stack = { ...stack0, ...(await page.evaluate(pageStack)), raf_calls_per_sec: rafPerSec };

// page transition: click the first internal nav link and film the hand-off
const transition = await (async () => {
  const href = await page.evaluate((origin) => { const a = [...document.querySelectorAll("header a[href], nav a[href], a[href]")].find((a) => a.href.startsWith(origin) && a.href.split("#")[0] !== location.href.split("#")[0] && a.getBoundingClientRect().width > 0 && a.getBoundingClientRect().top >= 0 && a.getBoundingClientRect().top < innerHeight); if (!a) return null; a.setAttribute("data-tdt", "1"); return a.href; }, origin);
  if (!href) return null;
  await page.mouse.wheel(0, -99999); await sleep(600);
  const t0 = Date.now(); await page.click("[data-tdt]", { timeout: 3000, noWaitAfter: true }).catch(() => {});
  const shots = [];
  for (const t of [100, 300, 600, 1000, 1600]) { await sleep(Math.max(0, t - (Date.now() - t0))); const f = `states/transition-${t}ms.jpg`; await page.screenshot({ path: join(OUT, f), quality: 65, type: "jpeg" }).catch(() => {}); shots.push(f); }
  const spa = await page.evaluate(() => !!window.__td);  // hooks survive = client-side navigation (SPA transition), not a full reload
  await page.goBack({ timeout: 15000 }).catch(() => {}); await sleep(2500);
  return { to: href, client_side: spa, frames: shots };
})();

// links for other pages
const links = await page.evaluate((origin) => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href.split("#")[0]).filter((h) => h.startsWith(origin) && !/\.(pdf|jpg|png|zip|mp4)$/i.test(h)))], origin);

// continuous human-speed scroll → a frame every ~0.7 screen → contact sheets (5×4 tiles of 360 px), built in Node
log("scroll frames → contact sheets");
await page.mouse.wheel(0, -99999); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1200);
const frames = [];
{
  const total = Math.max(await page.evaluate(() => document.documentElement.scrollHeight), wheelTravel + VH);  // virtual scrollers: use measured travel
  const every = Math.max(1, Math.round((VH * 0.7) / 60));
  for (let y = 0, n = 0; y < total + VH && n < 900 && frames.length < 60; y += 60, n++) {
    if (n % every === 0) frames.push(PNG.sync.read(await page.screenshot({ type: "png" })));
    await page.mouse.wheel(0, 60); await sleep(45);
  }
}
await ctx.close();
{
  const tile = 360, th = Math.round((tile * VH) / VW), cols = 5, rows = 4;
  for (let sheet = 0; sheet * cols * rows < frames.length; sheet++) {
    const o = new PNG({ width: cols * tile, height: rows * th }); o.data.fill(255);
    frames.slice(sheet * cols * rows, (sheet + 1) * cols * rows).forEach((f, k) => {
      const ox = (k % cols) * tile, oy = Math.floor(k / cols) * th, sx = f.width / tile, sy = f.height / th;
      for (let y = 0; y < th; y++) for (let x = 0; x < tile; x++) {
        const si = (Math.floor(y * sy) * f.width + Math.floor(x * sx)) * 4, di = ((oy + y) * o.width + ox + x) * 4;
        o.data[di] = f.data[si]; o.data[di + 1] = f.data[si + 1]; o.data[di + 2] = f.data[si + 2]; o.data[di + 3] = 255;
      }
    });
    writeFileSync(join(OUT, `scroll-sheet-${String(sheet + 1).padStart(2, "0")}.png`), PNG.sync.write(o));
  }
}

// ---- 3. other pages (lighter pass: screenshots per step + stack)
const pages = [];
for (const link of links.filter((l) => l.replace(/\/$/, "") !== url.replace(/\/$/, "")).slice(0, MAX_PAGES)) {
  log(`page ${link}`);
  const c2 = await browser.newContext(ctxOpts(false)); await c2.addInitScript(INIT);
  const p2 = await c2.newPage(); watchNetwork(p2);
  const slug = new URL(link).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  mkdirSync(join(OUT, "pages", slug), { recursive: true });
  try {
    await p2.goto(link, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
    await sleep(Math.max(2500, introReadyMs + 1500));  // same preloader budget as the home page
    const st = await p2.evaluate(pageStack);
    let n = 0, lastHash = "", same = 0;
    for (; n < 10; n++) {
      const buf = await p2.screenshot({ path: join(OUT, "pages", slug, `s${n}.jpg`), quality: 60, type: "jpeg" });
      const h = createHash("sha1").update(buf).digest("hex");
      same = h === lastHash ? same + 1 : 0; lastHash = h;
      if (same >= 1) break;  // screen stopped changing: end of page (works for virtual scrollers too)
      await p2.mouse.move(VW / 2, VH / 2); for (let k = 0; k < 8; k++) { await p2.mouse.wheel(0, VH / 8); await sleep(30); }
      await sleep(900);
    }
    pages.push({ url: link, slug, title: st.title, docHeight: st.docHeight, libs: st.libs, canvases: st.canvases.length, screenshots: n + 1 });
    const sh = await p2.evaluate(() => window.__td?.shaders || []); for (const s of sh) if (!shaders.includes(s)) shaders.push(s);
  } catch (e) { pages.push({ url: link, error: e.message.slice(0, 120) }); }
  await c2.close();
}
await browser.close();

// ---- 4. write outputs
const bundles = analyzeBundles(bundleTexts);
const isBuiltin = (s) => /#define (STANDARD|PHYSICAL|PHONG|LAMBERT|BASIC|TOON|MATCAP|DEPTH|DISTANCE|NORMAL)\b|#define SHADER_NAME (Mesh|Points|Line|Shadow|Sprite)/.test(s) || /^\s*#version 300 es\s*\n#define varying in\s*\nlayout\(location = 0\) out highp vec4 pc_fragColor;[\s\S]*#include/.test(s);
let custom = 0;
shaders.forEach((s, n) => {
  const kind = /gl_Position/.test(s) ? "vert" : "frag";
  const builtin = isBuiltin(s);
  if (!builtin) custom++;
  writeFileSync(join(OUT, "shaders", `${builtin ? "builtin" : "custom"}-${String(n).padStart(3, "0")}.${kind}`), s);
});
const assetList = [...assets.values()];
const byKind = (k) => assetList.filter((a) => a.kind === k);
save("stack.json", { stack, bundles, cursor, pages, transition, intro_ready_ms: introReadyMs, virtual_scroll: virtualScroll });
save("motion.json", motion);
save("hover.json", { hovers, cursor });
save("three.json", three || { note: "no three.js scene observed (not three.js, or three < r127 without the devtools hook)" });
save("assets.json", assetList);
save("states.json", states);

const top = (arr, n = 6) => arr.slice(0, n).map(([k, v]) => `${k} ×${v}`).join(", ");
const L = [];
const screens = (virtualScroll ? wheelTravel + VH : stack.docHeight) / VH;
L.push(`# Teardown: ${url}`, "", `Title: ${stack.title} · viewport ${VW}×${VH} · ${screens.toFixed(1)} screens${virtualScroll ? " · VIRTUAL SCROLL (content moved by transforms inside a fixed wrapper, e.g. ScrollSmoother / custom)" : ""} · ${pages.length} other page(s) crawled`, "");
L.push("## Stack (runtime + bundle evidence)");
L.push(`- runtime: ${JSON.stringify(stack.libs)}`);
L.push(`- bundle keywords: ${Object.entries(bundles.keyword_hits).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, v]) => `${k}:${v}`).join(" · ")}`);
L.push(`- canvases: ${stack.canvases.map((c) => `${c.ctx} ${c.w}×${c.h}${c.fixed ? " fixed" : ""} @${c.top}px`).join("; ") || "none"} · videos: ${stack.videos.length} · rAF calls/s: ${stack.raf_calls_per_sec}`);
L.push(`- fonts loaded: ${stack.fonts.join(", ") || "none detected"}`);
L.push("", "## Motion vocabulary from the code");
L.push(`- GSAP eases: ${top(bundles.gsap_eases, 8) || "—"}`, `- durations: ${top(bundles.durations, 8) || "—"} · staggers: ${top(bundles.staggers, 5) || "—"}`);
L.push(`- ScrollTrigger start/end: ${top(bundles.scroll_starts, 5) || "—"} / ${top(bundles.scroll_ends, 5) || "—"} · scrub: ${top(bundles.scrub_values, 4) || "—"}`);
L.push(`- CSS eases: ${top(bundles.css_eases, 6) || "—"}`);
if (bundles.lenis_options.length) L.push(`- smooth-scroll config: \`${bundles.lenis_options[0]}\``);
bundles.scrolltrigger_snippets.slice(0, 6).forEach((s) => L.push(`- \`${s.slice(0, 200)}\``));
L.push("", "## Intro sequence", `Frames at 0.3–7 s after navigation: intro/t*.jpg${VIDEO ? " · video intro/intro.webm" : ""}. LOOK at them in order: preloader, counter, curtain, hero entrance order.`);
L.push("", "## Motion map (measured while wheel-scrolling)");
if (!wheelTravel) L.push("- the page does NOT scroll: it's a one-screen layout; its motion lives in the intro, hovers, state toggles and page transitions below");
L.push(`- intro finished ≈ ${introReadyMs ? `${introReadyMs} ms` : "unknown"} after navigation (first full-content frame)`);
L.push(`- scroll-linked elements: ${motion.scroll_linked.length} · one-shot reveals: ${motion.reveals.length} · pinned: ${motion.pinned.length} · fixed UI: ${motion.fixed.length}${motion.split_text ? ` · split-text parts animated: ${motion.split_text.parts_animated} (${motion.split_text.props.join(", ")})` : ""}`);
motion.pinned.slice(0, 6).forEach((p) => L.push(`- PINNED ${p.el} "${p.text}" .${p.cls.split(" ")[0]} for ${p.steps_pinned} steps`));
motion.scroll_linked.slice(0, 12).forEach((p) => L.push(`- SCROLL-LINKED ${p.el} "${p.text}" .${p.cls.split(" ")[0]}: ${p.props.join("+")} (x ${p.range.tx.join("→")}px, y ${p.range.ty.join("→")}px, scale ${p.range.scale.join("→")})`));
motion.reveals.slice(0, 14).forEach((p) => L.push(`- REVEAL ${p.el} "${p.text}" @step ${p.at_step}: ${p.prop} ${p.from.transform !== p.to.transform ? `${p.from.transform.slice(0, 40)} → ${p.to.transform.slice(0, 40)}` : ""} opacity ${p.from.opacity}→${p.to.opacity}${p.from.clip ? ` clip ${p.from.clip.slice(0, 40)} → ${String(p.to.clip).slice(0, 40)}` : ""} · ${typeof p.timing === "string" ? p.timing : `${p.timing.duration_ms}ms ${p.timing.ease}`}`));
L.push("", "## Hover & cursor");
L.push(`- cursor: ${cursor.custom_cursor ? `CUSTOM ${JSON.stringify(cursor.elements[0])}` : `native (${cursor.css_cursor})`}`);
hovers.slice(0, 12).forEach((h) => L.push(`- ${h.el} "${h.text}": ${h.changes.join(" | ")}`));
L.push("", "## States", ...(states.length ? states.map((s) => `- ${s.trigger}: ${s.frames.join(", ")}`) : ["- no menu/tab toggles found"]));
L.push(transition ? `- PAGE TRANSITION → ${transition.to} (${transition.client_side ? "client-side, SPA-style: look for barba/taxi/View Transitions/router + GSAP" : "full page load"}): ${transition.frames.join(", ")}` : "- no internal link to test a page transition");
L.push("", "## WebGL / three.js");
if (three) {
  three.renderers.forEach((r) => L.push(`- renderer: toneMapping ${r.toneMapping}, exposure ${r.exposure}, ${r.colorSpace}, shadows ${r.shadows}, dpr ${r.pixelRatio}, ${r.info ? `${r.info.calls} draw calls, ${r.info.triangles} tris, ${r.info.programs} programs` : ""}`));
  three.scenes.forEach((s, n) => {
    L.push(`- scene ${n}: bg ${s.background}, env ${s.environment}, fog ${s.fog ? JSON.stringify(s.fog) : "none"}, objects ${JSON.stringify(s.counts)}`);
    s.lights.forEach((l) => L.push(`  - light ${l.type} ${l.color} ×${l.intensity} at [${l.pos}]${l.castShadow ? " shadows" : ""}`));
    s.materials.slice(0, 10).forEach((m) => L.push(`  - material ${m.type}${m.name ? ` "${m.name}"` : ""}: color ${m.color} rough ${m.roughness} metal ${m.metalness}${m.transmission ? ` transmission ${m.transmission} ior ${m.ior} thickness ${m.thickness}` : ""}${m.clearcoat ? ` clearcoat ${m.clearcoat}` : ""}${m.emissive && m.emissive !== "#000000" ? ` emissive ${m.emissive}` : ""} maps [${m.maps}]${m.customShader ? ` CUSTOM SHADER uniforms [${m.uniforms}]` : ""}`));
    s.meshes.slice(0, 8).forEach((m) => L.push(`  - ${m.type} ${m.geometry} ${m.verts} verts${m.instanced ? ` ×${m.instanced} instances` : ""} (${m.material})`));
  });
} else L.push(`- no three.js scene observed${stack.canvases.some((c) => c.ctx.includes("webgl")) ? " — but a WebGL canvas exists: read shaders/custom-* (OGL / raw WebGL / Spline / other)" : ""}`);
L.push(`- shaders captured: ${shaders.length} (${custom} custom → shaders/custom-*). Custom shaders ARE the look: port them, don't approximate.`);
L.push("", "## Assets (network)");
for (const k of ["font", "model", "hdri", "rive", "json", "video", "audio", "image"]) {
  const a = byKind(k); if (!a.length) continue;
  L.push(`- ${k} (${a.length}): ${a.sort((x, y) => (y.bytes || 0) - (x.bytes || 0)).slice(0, k === "image" ? 8 : 10).map((x) => `${x.saved || x.url.split("/").pop().slice(0, 50)}${x.bytes ? ` ${(x.bytes / 1024).toFixed(0)}KB` : ""}`).join(", ")}`);
}
L.push("", "## Pages", ...pages.map((p) => p.error ? `- ${p.url}: ERROR ${p.error}` : `- ${p.url} → pages/${p.slug}/s*.jpg (${p.screenshots} shots, ${(p.docHeight / VH).toFixed(1)} screens${p.canvases ? `, ${p.canvases} canvas` : ""})`));
L.push("", "## Evidence to LOOK at (in this order)", "1. intro/t*.jpg (the first 7 seconds)", `2. scroll-sheet-*.png (${frames.length} frames of one continuous scroll, 5×4 per sheet, read left→right, top→bottom)`, "3. steps/s*.jpg for exact frames per half-screen", "4. states/*.jpg (menu, hover)", "5. pages/*/s*.jpg");
save("teardown.md", L.join("\n"));
console.log(L.join("\n"));
