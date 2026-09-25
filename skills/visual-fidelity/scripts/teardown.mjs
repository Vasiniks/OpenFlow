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
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { launch, glRenderer } from "./browser.mjs";

const args = process.argv.slice(2);
const url = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
if (!url || url.startsWith("--")) { console.error("usage: teardown <url> --out <dir> [--pages 12] [--budget 480] [--viewport 1440x900] [--no-video] [--no-assets] [--steps 28]"); process.exit(2); }
const OUT = opt("out", "./teardown");
const [VW, VH] = opt("viewport", "1440x900").split("x").map(Number);
const MAX_PAGES = Number(opt("pages", "12")), STEPS_OPT = opt("steps", null);
const VIDEO = !flag("no-video"), ASSETS = !flag("no-assets");
// Time budget (s). Each phase gets a share and is cut short when its share is spent. Results are written after
// every phase, and a watchdog writes whatever exists if the run is still going 60 s past the budget.
// The default fits inside a 10-minute agent shell timeout.
const BUDGET_MS = Number(opt("budget", "600")) * 1000, T0 = Date.now();
const past = (share) => Date.now() - T0 > BUDGET_MS * share;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
for (const d of ["intro", "steps", "states", "pages", "shaders", "assets"]) mkdirSync(join(OUT, d), { recursive: true });
const log = (s) => console.error(`[teardown] ${Math.round((Date.now() - T0) / 1000)}s ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (f, o) => writeFileSync(join(OUT, f), typeof o === "string" ? o : JSON.stringify(o, null, 1));
// Never let one hung page call eat the budget.
// Page loads get 3 tries: a laptop switching network (ERR_NETWORK_CHANGED) or a slow hotspot shouldn't leave a blank page.
const gotoRetry = async (pg, u, waitUntil, timeout = 60000) => { for (let k = 1; k <= 3; k++) { try { await pg.goto(u, { waitUntil, timeout }); return true; } catch (e) { log(`goto ${k}/3: ${e.message.split("\n")[0]}`); await sleep(5000 * k); } } return false; };
const within = (p, ms, fallback = null) => Promise.race([Promise.resolve(p).catch(() => fallback), sleep(ms).then(() => fallback)]);

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
  S.fontFaces = [];
  try { const ir = CSSStyleSheet.prototype.insertRule; CSSStyleSheet.prototype.insertRule = function (r, i) { try { if (/^\s*@font-face/i.test(r) && S.fontFaces.length < 600) S.fontFaces.push(String(r).slice(0, 3000)); } catch (e) {} return ir.call(this, r, i); }; } catch (e) {}
  try { const FF = window.FontFace; if (FF) { const W = function (fam, src, d) { try { if (typeof src === 'string' && S.fontFaces.length < 600) S.fontFaces.push('@font-face{font-family:' + fam + ';src:' + src + ';font-weight:' + ((d && d.weight) || 'normal') + ';font-style:' + ((d && d.style) || 'normal') + '}'); } catch (e) {} return new FF(fam, src, d); }; W.prototype = FF.prototype; window.FontFace = W; } } catch (e) {}
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
  const split = qa("h1,h2,h3,h4,p,a,span,div").filter((e) => e.children.length >= 4 && [...e.children].every((c) => /(^|[\s_-])(char|word|line|split)/i.test(c.getAttribute?.("class") || "") || c.textContent.trim().length <= 1)).length;
  if (split) libs.split_text_blocks = split;
  const canvases = qa("canvas").map((c) => { const r = c.getBoundingClientRect(); return { ctx: c.__tdCtx || "none", w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), fixed: getComputedStyle(c).position === "fixed" }; });
  const videos = qa("video").map((v) => ({ src: (v.currentSrc || v.src || "").slice(0, 160), autoplay: v.autoplay, loop: v.loop, muted: v.muted, w: Math.round(v.getBoundingClientRect().width) }));
  const fonts = [...d.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight} ${f.style}`);
  const cursor = getComputedStyle(d.body).cursor;
  return { libs, canvases, videos, fonts: [...new Set(fonts)], bodyCursor: cursor, docHeight: d.documentElement.scrollHeight, title: d.title, rafCallsSoFar: w.__td?.raf };
}

// three.js positions for this scroll step: every mesh (world + screen-projected) and the camera, so paths are measurable
function sampleThree() {
  const T = window.__td?.three; if (!T || !T.scenes.length) return null;
  for (const r of T.renderers) if (r.render && !r.__tdWrapped) { const o = r.render.bind(r); r.render = (sc, c) => { r.__tdCam = c; return o(sc, c); }; r.__tdWrapped = true; }
  const cam = T.renderers.map((r) => r.__tdCam).find(Boolean);
  const out = { cam: null, objs: {} }; window.__tdN = window.__tdN || 0;
  if (cam) { const v = cam.position.clone(); cam.getWorldPosition(v); out.cam = [v.x, v.y, v.z].map((n) => +n.toFixed(3)); }
  let n = 0;
  for (const sc of T.scenes.slice(0, 6)) sc.traverse((o) => {
    if (!(o.isMesh || o.isPoints) || n >= 120) return; n++;
    if (!o.__tdId) o.__tdId = ++window.__tdN;
    const w = o.position.clone(); o.getWorldPosition(w);
    let scr = null; if (cam) { const p = w.clone().project(cam); if (p.z < 1 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6) scr = [Math.round((p.x + 1) * innerWidth / 2), Math.round((1 - p.y) * innerHeight / 2)]; }
    const m = [].concat(o.material)[0];
    out.objs[o.__tdId] = { name: o.name || undefined, kind: o.isPoints ? "points" : m?.map || m?.uniforms?.uImage || m?.uniforms?.uTexture ? "image-plane/textured" : o.geometry?.type, vis: o.visible, w: [w.x, w.y, w.z].map((x) => +x.toFixed(3)), scr, ry: +o.rotation.y.toFixed(3) };
  });
  return out;
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
    out.push({ i, tag, split: !!splitChild, text: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 48), cls: (el.getAttribute?.("class") || "").slice(0, 60) });
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

// Classify a 2D path (screen px or world units): loop/orbit, spiral, arc or line, with centre, radius, sweep and direction.
function pathShape(pts, unit = "px") {
  pts = pts.filter(Boolean); if (pts.length < 4) return null;
  const span = Math.max(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])));
  if (span < (unit === "px" ? 24 : 0.05)) return null;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const ds = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)), r = ds.reduce((a, d) => a + d, 0) / ds.length;
  const spread = r ? Math.sqrt(ds.reduce((a, d) => a + (d - r) ** 2, 0) / ds.length) / r : 1;
  let sweep = 0; for (let i = 1; i < pts.length; i++) { let d = Math.atan2(pts[i][1] - cy, pts[i][0] - cx) - Math.atan2(pts[i - 1][1] - cy, pts[i - 1][0] - cx); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; }
  const deg = Math.round((sweep * 180) / Math.PI), grow = ds[ds.length - 1] - ds[0];
  const shape = Math.abs(deg) >= 270 ? (Math.abs(grow) > r * 0.5 ? "spiral" : "loop/orbit") : Math.abs(deg) >= 60 && spread < 0.4 ? "arc" : "line/drift";  // ≥270°: sampling rarely catches a full turn
  const k = Math.max(1, Math.ceil(pts.length / 12)), rnd = (v) => (unit === "px" ? Math.round(v) : +v.toFixed(2));
  return { shape, sweep_deg: deg, direction: deg >= 0 ? "clockwise on screen" : "counter-clockwise on screen", center: [rnd(cx), rnd(cy)], radius: rnd(r), radius_change: rnd(grow), unit, points: pts.filter((_, i) => i % k === 0).map((p) => p.map(rnd)) };
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
const browser = await launch();
// Results so far; finalize() can write them at any point (after each phase, or from the watchdog).
let stack0 = { libs: {}, canvases: [], videos: [], fonts: [], docHeight: 0 }, stack = null, rafPerSec = 0, cands = [], wheelTravel = 0, virtualScroll = false, gl = "unknown";
let motion = { scroll_linked: [], reveals: [], pinned: [], fixed: [] }, hovers = [], cursor = { custom_cursor: false }, pointer = [], states = [];
let three = null, shaders = [], transitions = [], frames = [], pages = [], links = [], fontRules = [], threeTraj = { camera: null, objects: [] };
const phasesDone = [], phasesCut = [];
const norm = (u) => u.split("#")[0].split("?")[0].replace(/\/$/, "");
const seen = new Set([norm(url)]);
const ctxOpts = (video) => ({ viewport: { width: VW, height: VH }, userAgent: UA, deviceScaleFactor: 1, ...(video && VIDEO ? { recordVideo: { dir: join(OUT, "_video"), size: { width: VW, height: VH } } } : {}) });

const bundleTexts = [], assets = new Map();
const fontExt = (b) => { const m = b.subarray(0, 4).toString("latin1"); return m === "wOF2" ? ".woff2" : m === "wOFF" ? ".woff" : m === "OTTO" ? ".otf" : b.readUInt32BE(0) === 0x10000 || m === "true" ? ".ttf" : ""; };
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
      if (ASSETS && ["font", "model", "hdri", "rive", "json"].includes(kind) || (ASSETS && kind === "image" && (len > 60000)) || (ASSETS && kind === "video" && len < 60e6)) {
        const buf = await res.body().catch(() => null);
        if (!buf) return;
        entry.bytes = buf.length;
        if (kind === "json" && !/"layers"\s*:/.test(buf.slice(0, 20000).toString())) { assets.delete(u); return; }  // keep only Lottie JSON
        const cext = (kind === "font" && !ext ? fontExt(buf) : "") || ext || ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg", "image/gif": ".gif", "font/woff2": ".woff2", "font/woff": ".woff" }[entry.type] || "");
        // keep the source file name readable (image-intro01-2c7afe47.webp); assets.json maps every file back to its URL
      // last two path segments, so /interview/takashidoi01/hero-top.webp → takashidoi01-hero-top
      const stem = decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).slice(-2).join("-")).replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(-48).replace(/^-+/, "");
      const name = `${kind}-${stem ? `${stem}-` : ""}${createHash("sha1").update(u).digest("hex").slice(0, 8)}${cext}`;
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
  await gotoRetry(page, url, "commit");
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
log(`main pass (${browser.__gl} WebGL)`);
setTimeout(() => { log("budget exceeded, writing partial results"); try { finalize(); } catch (e) { log(`finalize: ${e.message}`); } process.exit(0); }, BUDGET_MS + 60000).unref();
const ctx = await browser.newContext(ctxOpts(false)); await ctx.addInitScript(INIT);
const page = await ctx.newPage(); watchNetwork(page);
if (!(await gotoRetry(page, url, "domcontentloaded"))) phasesCut.push("the page never finished loading (network): everything below is unreliable");
await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});  // WebGL/analytics sites never go idle
await sleep(Math.max(4000, introReadyMs + 1500));
gl = await glRenderer(page);
stack0 = (await within(page.evaluate(pageStack), 15000)) || stack0;
const raf0 = await within(page.evaluate(() => window.__td?.raf || 0), 5000, 0); await sleep(1000);
rafPerSec = (await within(page.evaluate(() => window.__td?.raf || 0), 5000, 0)) - raf0;
cands = (await within(page.evaluate(tagCandidates, 320), 30000)) || [];
const samples = [];
// Cover the WHOLE page: step count and size scale with its length (a fixed 28 half-screen steps saw only the first
// 14 screens of a 49-screen page, so most pins were never measured). Virtual scrollers keep half-screen steps.
const longPage = stack0.docHeight > VH * 1.2;
const MAX_STEPS = STEPS_OPT ? Number(STEPS_OPT) : longPage ? Math.min(80, Math.max(28, Math.ceil(stack0.docHeight / (VH * 0.6)))) : 28;
const stepPx = longPage ? Math.max(Math.round(VH * 0.5), Math.round(stack0.docHeight / MAX_STEPS)) : Math.round(VH * 0.5);
const sample = () => within(page.evaluate(sampleCandidates), 10000);
let stuck = 0;
const pageMoved = [true];  // pageMoved[s] = content moved between step s-1 and s
const threeSteps = [];
for (let s = 0; s < MAX_STEPS; s++) {
  if (past(0.5) && s >= 4) { phasesCut.push(`scroll motion map stopped at step ${s} of ${MAX_STEPS} (${Math.round(wheelTravel / VH)} screens); the rest of the page is only in the scroll sheets`); break; }
  const series = [];
  for (const t of [0, 300, 1000]) { if (t) await sleep(t - (series.length ? series[series.length - 1].t : 0)); const r = await sample(); if (r) series.push({ t, ...r }); }
  if (!series.length) { phasesCut.push(`page stopped answering at step ${s}`); break; }
  samples.push(series);
  threeSteps.push(await within(page.evaluate(sampleThree), 8000));
  await within(page.screenshot({ path: join(OUT, "steps", `s${String(s).padStart(2, "0")}.jpg`), quality: 62, type: "jpeg" }), 15000);
  // wheel like a person (works with Lenis/Locomotive/virtual scrollers, unlike scrollTo)
  await page.mouse.move(VW / 2, VH / 2);
  for (let k = 0; k < 8; k++) { await page.mouse.wheel(0, stepPx / 8); await sleep(30); }
  await sleep(500);
  // "did the page move?" measured on content, not scrollY, so virtual scrollers (transform-based) work too
  const nowTops = (await sample())?.res || {};
  const prevTops = series[series.length - 1].res;
  const deltas = Object.keys(nowTops).map((k) => Math.abs(nowTops[k][0] - (prevTops[k]?.[0] ?? nowTops[k][0])));
  const moved = deltas.filter((d) => d > 20).length / Math.max(1, deltas.length) > 0.15;
  pageMoved.push(moved);
  wheelTravel += moved ? stepPx : 0;
  stuck = moved ? 0 : stuck + 1;
  if (stuck >= 2 && s > 1) { const r = await sample(); if (r) { samples.push([{ t: 0, ...r }]); pageMoved.push(false); } break; }
}
virtualScroll = stack0.docHeight <= VH * 1.2 && wheelTravel > VH;
threeTraj = { camera: null, objects: [] };
{
  const steps = threeSteps.filter(Boolean);
  if (steps.length >= 4) {
    const camPts = steps.map((st) => st.cam).filter(Boolean);
    if (camPts.length >= 4) { const moved = Math.hypot(...camPts[0].map((v, i) => v - camPts[camPts.length - 1][i])); threeTraj.camera = { moves: moved > 0.05, start: camPts[0], end: camPts[camPts.length - 1], path_xz: pathShape(camPts.map((p) => [p[0], p[2]]), "world"), path_xy: pathShape(camPts.map((p) => [p[0], p[1]]), "world") }; }
    const ids = [...new Set(steps.flatMap((st) => Object.keys(st.objs)))];
    const per = ids.map((id) => {
      const seq = steps.map((st) => st.objs[id]).filter((o) => o && o.vis);
      if (seq.length < 4) return null;
      const scr = pathShape(seq.map((o) => o.scr)), world = pathShape(seq.map((o) => [o.w[0], o.w[1]]), "world");
      const path = scr && scr.shape !== "line/drift" ? scr : world && world.shape !== "line/drift" ? world : scr || world;
      return path ? { id, name: seq[0].name, kind: seq[0].kind, steps_visible: seq.length, spin: Math.abs(seq[seq.length - 1].ry - seq[0].ry) > 0.2, path } : null;
    }).filter(Boolean);
    // many objects on the same kind of path (e.g. 30 photo planes on one loop) → one group line
    const groups = new Map();
    for (const o of per) { const k = `${o.kind}|${o.path.shape}|${Math.sign(o.path.sweep_deg)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    threeTraj.objects = [...groups.values()].map((g) => ({ count: g.length, kind: g[0].kind, names: [...new Set(g.map((o) => o.name).filter(Boolean))].slice(0, 5), shape: g[0].path.shape, unit: g[0].path.unit,
      sweep_deg: Math.round(g.reduce((a, o) => a + o.path.sweep_deg, 0) / g.length), radius: +(g.reduce((a, o) => a + o.path.radius, 0) / g.length).toFixed(2), center: g[0].path.center, direction: g[0].path.direction, spin: g.some((o) => o.spin), example_points: g[0].path.points }))
      .sort((a, b) => (a.shape === "line/drift") - (b.shape === "line/drift") || b.count - a.count).slice(0, 12);
  }
}
// motion classification
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
    const seen = finals.map((f, s) => (inView[s] ? f : null));
    const tPath = pathShape(seen.map((f) => { if (!f) return null; const m = parseMatrix(f[3]); return [m.tx, m.ty]; }));
    const sPath = pathShape(seen.map((f) => (f ? [f[1], f[0] + f[2] / 2] : null)));
    const path = [tPath, sPath].filter(Boolean).sort((a, b) => Math.abs(b.sweep_deg) - Math.abs(a.sweep_deg))[0];
    motion.scroll_linked.push({ el: c.tag, text: c.text, cls: c.cls, split_part: c.split || undefined, path: path && path.shape !== "line/drift" ? path : undefined, props: [...props], range: { tx: [Math.min(...tx.map((m) => m.tx)), Math.max(...tx.map((m) => m.tx))].map(Math.round), ty: [Math.min(...tx.map((m) => m.ty)), Math.max(...tx.map((m) => m.ty))].map(Math.round), scale: [Math.min(...tx.map((m) => m.s)), Math.max(...tx.map((m) => m.s))].map((v) => +v.toFixed(2)) } });
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
// split-text parts scrubbed by scroll: one entry per class with the spread of offsets, not one line per character
const splitScroll = motion.scroll_linked.filter((r) => r.split_part);
motion.scroll_linked = motion.scroll_linked.filter((r) => !r.split_part);
if (splitScroll.length) {
  const groups = {}; for (const r of splitScroll) (groups[r.cls.split(" ")[0]] ||= []).push(r);
  motion.split_scroll = Object.entries(groups).map(([cls, rs]) => ({ cls, parts: rs.length, text: rs.map((r) => r.text).join("").slice(0, 40), props: [...new Set(rs.flatMap((r) => r.props))],
    tx: [Math.min(...rs.map((r) => r.range.tx[0])), Math.max(...rs.map((r) => r.range.tx[1]))], ty: [Math.min(...rs.map((r) => r.range.ty[0])), Math.max(...rs.map((r) => r.range.ty[1]))] }));
}
phasesDone.push("scroll motion map");
// runtime evidence (again before the transitions below navigate away and reset the hooks)
// cssText keeps URLs as authored ("/f/x.woff"), so resolve them against the stylesheet (or page) to match assets.json
const collectFontRules = (pg) => within(pg.evaluate(() => {
  const abs = (r, base) => r.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (m, u) => { try { return `url("${new URL(u, base).href}")`; } catch { return m; } });
  return [...(window.__td?.fontFaces || []).map((r) => abs(r, location.href)), ...[...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].filter((r) => r.type === 5).map((r) => abs(r.cssText, sh.href || location.href)); } catch { return []; } })];
}), 10000, []).then((rs) => { for (const r of rs || []) if (!fontRules.includes(r)) fontRules.push(r); });
const runtimeEvidence = async () => {
  await collectFontRules(page);
  three = (await within(page.evaluate(threeScene), 10000)) || three;
  for (const s of (await within(page.evaluate(() => window.__td?.shaders || []), 10000, []))) if (!shaders.includes(s)) shaders.push(s);
  stack = { ...stack0, ...((await within(page.evaluate(pageStack), 15000)) || {}), raf_calls_per_sec: rafPerSec };
};
await runtimeEvidence();
finalize();

// hover map + custom cursor
log("hover + cursor");
await within(page.evaluate(() => window.scrollTo(0, 0)), 5000); await page.mouse.wheel(0, -99999); await sleep(1500);
const hoverTargets = past(0.58) ? [] : await within(page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("a,button,[role=button],[data-cursor],[class*=card],[class*=link],[class*=btn]")) {
    const r = el.getBoundingClientRect(); if (r.width < 20 || r.height < 12 || r.top < 0 || r.bottom > innerHeight) continue;
    el.setAttribute("data-tdh", String(out.length)); out.push({ i: out.length, tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40), x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (out.length >= 24) break;
  }
  return out;
}), 15000, []);
const snapHover = (i) => within(page.evaluate((i) => {
  const el = document.querySelector(`[data-tdh="${i}"]`); if (!el) return null;
  const nodes = [el, ...el.querySelectorAll("*")].slice(0, 25);
  return nodes.map((n) => { const cs = getComputedStyle(n); return [n.tagName.toLowerCase(), cs.transform, cs.opacity, cs.color, cs.backgroundColor, cs.clipPath, cs.filter, cs.textDecorationLine, cs.letterSpacing, cs.borderColor, cs.boxShadow.slice(0, 40), cs.width]; });
}, i), 8000);
for (const h of hoverTargets) {
  if (past(0.61)) { phasesCut.push(`hover map stopped after ${hovers.length} of ${hoverTargets.length} targets`); break; }
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
cursor = await (async () => {
  const pos = async () => within(page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const cs = getComputedStyle(e); return cs.position === "fixed" && cs.pointerEvents === "none"; }).map((e) => { const r = e.getBoundingClientRect(); return { cls: (e.getAttribute?.("class") || e.tagName).slice(0, 50), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), blend: getComputedStyle(e).mixBlendMode }; })), 8000, []);
  await page.mouse.move(200, 200, { steps: 5 }); await sleep(600); const p1 = await pos();
  await page.mouse.move(900, 600, { steps: 8 }); await sleep(600); const p2 = await pos();
  const moved = p2.filter((b) => { const a = p1.find((x) => x.cls === b.cls); return a && Math.hypot(a.x - b.x, a.y - b.y) > 200 && b.w < 400; });
  return moved.length ? { custom_cursor: true, elements: moved.slice(0, 3) } : { custom_cursor: false, css_cursor: stack0.bodyCursor };
})();

// pointer probe: does the page react to the mouse? (WebGL/shader distortion, mouse parallax, magnetic elements)
log("pointer probe");
const small = (png, w = 240) => { const h = Math.round((w * png.height) / png.width), o = new Uint8Array(w * h * 3), sx = png.width / w, sy = png.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = (Math.floor(y * sy) * png.width + Math.floor(x * sx)) * 4, di = (y * w + x) * 3; o[di] = png.data[si]; o[di + 1] = png.data[si + 1]; o[di + 2] = png.data[si + 2]; }
  return { w, h, d: o }; };
const cellDiff = (a, b) => { // % of pixels changed per 3×3 cell
  const out = []; for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) { let n = 0, t = 0;
    for (let y = Math.floor((cy * a.h) / 3); y < Math.floor(((cy + 1) * a.h) / 3); y++) for (let x = Math.floor((cx * a.w) / 3); x < Math.floor(((cx + 1) * a.w) / 3); x++) { const i = (y * a.w + x) * 3; t++; if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]) > 30) n++; }
    out.push(+((100 * n) / t).toFixed(1)); } return out; };
const CELL = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
phasesDone.push("hover + cursor");
for (const [label, dy] of [["top", 0], ["mid-page", Math.round(wheelTravel / 2)]]) {
  if (label === "mid-page" && !wheelTravel) continue;
  if (past(0.67)) { phasesCut.push(`pointer probe skipped at ${label}`); break; }
  await page.mouse.move(VW / 2, VH / 2); await page.mouse.wheel(0, -99999); await sleep(900);
  for (let k = 0, left = dy; left > 0 && k < 60; k++, left -= 200) { await page.mouse.wheel(0, Math.min(200, left)); await sleep(40); }
  await sleep(1400);
  const snapT = () => within(page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-td]")].map((e) => [e.getAttribute("data-td"), getComputedStyle(e).transform]))), 8000, {});
  await page.mouse.move(VW / 2, VH / 2, { steps: 4 }); await sleep(900);
  const base = small(PNG.sync.read(await page.screenshot({ type: "png" }))), baseT = await snapT();
  await sleep(700);  // ambient baseline: what changes with the mouse held still (idle WebGL, marquees, video)
  const ambient = new Set(cellDiff(base, small(PNG.sync.read(await page.screenshot({ type: "png" })))).map((p, i) => (p > 2 ? CELL[i] : null)).filter(Boolean));
  const res = { at: label, reactive_cells: new Set(), moved_elements: new Set(), ambient_cells: [...ambient] };
  for (const [fx, fy] of [[0.12, 0.18], [0.88, 0.18], [0.12, 0.82], [0.88, 0.82]]) {
    await page.mouse.move(VW * fx, VH * fy, { steps: 10 }); await sleep(700);
    const shot = PNG.sync.read(await page.screenshot({ type: "png" }));
    if (fx === 0.88 && fy === 0.82) writeFileSync(join(OUT, "states", `pointer-${label}-corner.png`), PNG.sync.write(shot));
    cellDiff(base, small(shot)).forEach((p, i) => { if (p > 2 && !ambient.has(CELL[i])) res.reactive_cells.add(CELL[i]); });
    const t = await snapT(); for (const k of Object.keys(t)) if (t[k] !== baseT[k] && byIdx(k)) res.moved_elements.add(byIdx(k));
  }
  pointer.push({ at: label, reactive_cells: [...res.reactive_cells], ambient_cells: res.ambient_cells, moved_elements: [...res.moved_elements].slice(0, 8) });
}
function byIdx(k) { const c = cands.find((x) => String(x.i) === k); return c ? `${c.tag} "${c.text.slice(0, 24)}" .${(c.cls || "").split(" ")[0]}` : null; }

// menu / tabs / other states
phasesDone.push("pointer probe");
log("states");
for (const sel of ["button[aria-expanded=false]", "[class*=burger]", "[class*=menu-toggle]", "[class*=menu] button", "[aria-label*=menu i]", "[role=tab]"]) {
  if (past(0.7)) { phasesCut.push("menu/tab states"); break; }
  const el = await within(page.$(sel), 5000); if (!el || !(await el.isVisible().catch(() => false))) continue;
  const name = sel.replace(/[^a-z]/gi, "").slice(0, 20);
  await el.click({ timeout: 2000 }).catch(() => {});
  for (const t of [120, 450, 1100]) { await sleep(t === 120 ? 120 : t - (t === 450 ? 120 : 450)); await page.screenshot({ path: join(OUT, "states", `${name}-${t}ms.jpg`), quality: 70, type: "jpeg" }).catch(() => {}); }
  states.push({ trigger: sel, frames: [120, 450, 1100].map((t) => `states/${name}-${t}ms.jpg`) });
  await page.keyboard.press("Escape").catch(() => {}); await el.click({ timeout: 1500 }).catch(() => {}); await sleep(900);
  if (states.length >= 3) break;
}

// runtime evidence first (the transition below navigates away and resets the hooks)
await runtimeEvidence();
phasesDone.push("states");
finalize();

// page transitions: click up to 3 different internal links and film each hand-off (and the way back)
for (let n = 0; n < 3; n++) {
  if (past(0.77)) { phasesCut.push(`page transitions stopped after ${n}`); break; }
  const href = await within(page.evaluate(({ origin, done }) => { const a = [...document.querySelectorAll("header a[href], nav a[href], a[href]")].find((a) => a.href.startsWith(origin) && !done.includes(a.href.split("#")[0]) && a.href.split("#")[0] !== location.href.split("#")[0] && a.getBoundingClientRect().width > 0 && a.getBoundingClientRect().top >= 0 && a.getBoundingClientRect().top < innerHeight); if (!a) return null; document.querySelectorAll("[data-tdt]").forEach((e) => e.removeAttribute("data-tdt")); a.setAttribute("data-tdt", "1"); return a.href.split("#")[0]; }, { origin, done: transitions.map((t) => t.to) }), 8000);
  if (!href) break;
  await page.mouse.wheel(0, -99999); await sleep(600);
  const t0 = Date.now(); await page.click("[data-tdt]", { timeout: 3000, noWaitAfter: true }).catch(() => {});
  const shots = [];
  for (const t of [100, 300, 600, 1000, 1600]) { await sleep(Math.max(0, t - (Date.now() - t0))); const f = `states/transition${n + 1}-${t}ms.jpg`; await page.screenshot({ path: join(OUT, f), quality: 65, type: "jpeg" }).catch(() => {}); shots.push(f); }
  const spa = await page.evaluate(() => !!window.__td);  // hooks survive = client-side navigation (SPA transition), not a full reload
  const t1 = Date.now(); await page.goBack({ timeout: 15000 }).catch(() => {});
  const back = []; for (const t of [150, 600]) { await sleep(Math.max(0, t - (Date.now() - t1))); const f = `states/transition${n + 1}-back-${t}ms.jpg`; await page.screenshot({ path: join(OUT, f), quality: 60, type: "jpeg" }).catch(() => {}); back.push(f); }
  await sleep(2500);
  transitions.push({ to: href, client_side: spa, frames: shots, back });
}
phasesDone.push("page transitions");

// links for other pages
links = (await within(page.evaluate((origin) => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href.split("#")[0]).filter((h) => h.startsWith(origin) && !/\.(pdf|jpg|png|zip|mp4)$/i.test(h)))], origin), 10000)) || [];

// continuous human-speed scroll → a frame every ~0.7 screen → contact sheets (5×4 tiles of 360 px), built in Node
log("scroll frames → contact sheets");
await page.mouse.wheel(0, -99999); await within(page.evaluate(() => window.scrollTo(0, 0)), 5000); await sleep(1200);
{
  const total = Math.max((await within(page.evaluate(() => document.documentElement.scrollHeight), 5000)) || stack0.docHeight, wheelTravel + VH);  // virtual scrollers: use measured travel
  const every = Math.max(1, Math.round((VH * 0.7) / 60));
  mkdirSync(join(OUT, "progress"), { recursive: true });
  for (let y = 0, n = 0; y < total + VH && n < 900 && frames.length < 60; y += 60, n++) {
    if (past(0.88)) { phasesCut.push(`continuous scroll stopped at ${Math.round((100 * y) / total)}% of the page`); break; }
    if (n % every === 0) {
      const buf = await within(page.screenshot({ type: "png" }), 15000); if (!buf) continue;
      const png = PNG.sync.read(buf);
      frames.push(png);
      // progress-indexed copy (720 px) so a build can be compared with the reference at the same point of the scroll
      const pct = String(Math.min(100, Math.round((100 * y) / Math.max(1, total - VH)))).padStart(3, "0");
      const w = 720, h = Math.round((w * png.height) / png.width), o = new PNG({ width: w, height: h }), sx = png.width / w, sy = png.height / h;
      for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) { const si = (Math.floor(yy * sy) * png.width + Math.floor(x * sx)) * 4, di = (yy * w + x) * 4; o.data[di] = png.data[si]; o.data[di + 1] = png.data[si + 1]; o.data[di + 2] = png.data[si + 2]; o.data[di + 3] = 255; }
      writeFileSync(join(OUT, "progress", `p${pct}.png`), PNG.sync.write(o));
    }
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
phasesDone.push("continuous scroll");
// breadth-first crawl of the whole site: every page's own links join the queue (up to --pages)
const queue = [];
for (const l of links) if (!seen.has(norm(l))) { seen.add(norm(l)); queue.push(l); }
while (queue.length && pages.length < MAX_PAGES) {
  if (past(0.97)) { phasesCut.push(`crawl stopped after ${pages.length} pages (${queue.length} queued)`); break; }
  const link = queue.shift();
  log(`page ${link}`);
  const c2 = await browser.newContext(ctxOpts(false)); await c2.addInitScript(INIT);
  const p2 = await c2.newPage(); watchNetwork(p2);
  const slug = new URL(link).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  mkdirSync(join(OUT, "pages", slug), { recursive: true });
  try {
    await gotoRetry(p2, link, "domcontentloaded", 45000);
    await p2.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await sleep(Math.max(2500, introReadyMs + 1500));  // same preloader budget as the home page
    const st = (await within(p2.evaluate(pageStack), 15000)) || { title: "", docHeight: 0, libs: {}, canvases: [] };
    let n = 0, lastHash = "", same = 0;
    for (; n < 10; n++) {
      const buf = await within(p2.screenshot({ path: join(OUT, "pages", slug, `s${n}.jpg`), quality: 60, type: "jpeg" }), 15000); if (!buf) break;
      const h = createHash("sha1").update(buf).digest("hex");
      same = h === lastHash ? same + 1 : 0; lastHash = h;
      if (same >= 1) break;  // screen stopped changing: end of page (works for virtual scrollers too)
      await p2.mouse.move(VW / 2, VH / 2); for (let k = 0; k < 8; k++) { await p2.mouse.wheel(0, VH / 8); await sleep(30); }
      await sleep(900);
    }
    pages.push({ url: link, slug, title: st.title, docHeight: st.docHeight, libs: st.libs, canvases: st.canvases.length, screenshots: n + 1 });
    const more = await p2.evaluate((origin) => [...document.querySelectorAll("a[href]")].map((a) => a.href.split("#")[0]).filter((h) => h.startsWith(origin) && !/\.(pdf|jpg|png|zip|mp4)$/i.test(h)), origin).catch(() => []);
    for (const l of more) if (!seen.has(norm(l))) { seen.add(norm(l)); queue.push(l); }
    await collectFontRules(p2);
    const sh = await within(p2.evaluate(() => window.__td?.shaders || []), 8000, []); for (const s of sh) if (!shaders.includes(s)) shaders.push(s);
  } catch (e) { pages.push({ url: link, error: e.message.slice(0, 120) }); }
  await c2.close();
}
await browser.close();
// Files the page requested but whose body couldn't be read (streamed video, large models, requests cut off by navigation):
// download them directly so the build can use the reference's own files (agents shouldn't need curl for this).
if (ASSETS) {
  const want = [...assets.values()].filter((a) => !a.saved && ["font", "model", "hdri", "rive", "video"].includes(a.kind) || (!a.saved && a.kind === "image" && (a.bytes || 0) > 60000));
  let got = 0;
  for (const a of want) {
    if (Date.now() - T0 > BUDGET_MS + 30000) break;
    try {
      const r = await fetch(a.url, { headers: { "user-agent": UA, referer: url }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 60e6) continue;
      const ext = (a.kind === "font" && !extname(new URL(a.url).pathname) ? fontExt(buf) : "") || extname(new URL(a.url).pathname).toLowerCase();
      const stem = decodeURIComponent(new URL(a.url).pathname.split("/").filter(Boolean).slice(-2).join("-")).replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(-48).replace(/^-+/, "");
      const name = `${a.kind}-${stem ? `${stem}-` : ""}${createHash("sha1").update(a.url).digest("hex").slice(0, 8)}${ext}`;
      writeFileSync(join(OUT, "assets", name), buf); a.saved = `assets/${name}`; a.bytes = buf.length; a.fetched_after = true; got++;
    } catch {}
  }
  if (want.length) log(`downloaded ${got} of ${want.length} assets the page loaded but the browser couldn't hand over`);
}
if (pages.length) phasesDone.push(`crawl (${pages.length} pages)`);
console.log(finalize());
process.exit(0);

// ---- 4. write outputs (also called after each phase and by the watchdog, so a cut-short run still leaves results)
function finalize() {
const transition = transitions[0] || null;
const stackNow = stack || { ...stack0, raf_calls_per_sec: rafPerSec };
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
save("stack.json", { stack: stackNow, gl_renderer: gl, phases_done: phasesDone, phases_cut: phasesCut, bundles, cursor, pointer, pages, pages_found: seen.size, transitions, transition, intro_ready_ms: introReadyMs, virtual_scroll: virtualScroll });
save("motion.json", motion);
save("hover.json", { hovers, cursor });
save("three.json", three ? { ...three, trajectories: threeTraj } : { note: "no three.js scene observed (not three.js, or three < r127 without the devtools hook)" });
save("assets.json", assetList);
const fontMap = [];
for (const r of fontRules) {
  const fam = (r.match(/font-family:\s*["']?([^;"'}]+)/i) || [])[1]?.trim(); if (!fam) continue;
  const weight = (r.match(/font-weight:\s*([^;}]+)/i) || [])[1]?.trim() || "normal", style = (r.match(/font-style:\s*([^;}]+)/i) || [])[1]?.trim() || "normal";
  for (const [, u] of r.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const hit = assets.get(u) || [...assets.values()].find((a) => a.url.split("?")[0] === u.split("?")[0]);
    if (hit?.saved && !fontMap.some((f) => f.saved === hit.saved && f.family === fam)) fontMap.push({ family: fam, weight, style, url: u, saved: hit.saved });
  }
}
save("fonts.json", fontMap);
save("fonts.css", fontMap.map((f) => `@font-face { font-family: "${f.family}"; src: url("./${f.saved}")${/\.woff2$/.test(f.saved) ? ' format("woff2")' : /\.woff$/.test(f.saved) ? ' format("woff")' : ""}; font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`).join("\n") + "\n");
save("states.json", states);

const top = (arr, n = 6) => arr.slice(0, n).map(([k, v]) => `${k} ×${v}`).join(", ");
const L = [];
const screens = (virtualScroll ? wheelTravel + VH : stackNow.docHeight) / VH;
L.push(`# Teardown: ${url}`, "", `Title: ${stackNow.title} · viewport ${VW}×${VH} · ${screens.toFixed(1)} screens${virtualScroll ? " · VIRTUAL SCROLL (content moved by transforms inside a fixed wrapper, e.g. ScrollSmoother / custom)" : ""} · ${pages.length} other page(s) crawled`, "");
L.push(`WebGL: ${browser.__gl === "gpu" ? "GPU" : "SOFTWARE (SwiftShader), so heavy WebGL scenes run slowly and motion timing may be distorted"} (${gl}) · ${Math.round((Date.now() - T0) / 1000)} s of a ${BUDGET_MS / 1000} s budget`);
if (phasesCut.length) L.push(`**PARTIAL:** cut short by the time budget: ${phasesCut.join("; ")}. Re-run what was cut (bash timeout 1200000): \`vf teardown ${url} --out ${OUT.replace(/\/$/, "")}-2 --budget ${Math.round((BUDGET_MS / 1000) * 1.6)} --pages ${Math.max(1, MAX_PAGES - pages.length)}\`. Use both folders.`);
L.push(`Phases completed: ${phasesDone.join(", ") || "intro only"}`, "");
L.push("## Stack (runtime + bundle evidence)");
L.push(`- runtime: ${JSON.stringify(stackNow.libs)}`);
L.push(`- bundle keywords: ${Object.entries(bundles.keyword_hits).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, v]) => `${k}:${v}`).join(" · ")}`);
L.push(`- canvases: ${stackNow.canvases.map((c) => `${c.ctx} ${c.w}×${c.h}${c.fixed ? " fixed" : ""} @${c.top}px`).join("; ") || "none"} · videos: ${stackNow.videos.length} · rAF calls/s: ${stackNow.raf_calls_per_sec}`);
L.push(`- fonts loaded: ${stackNow.fonts.join(", ") || "none detected"}`);
L.push(`- font files → families: ${fontRules.length ? "fonts.json / fonts.css (copy fonts.css and the files it names; it maps each family to its saved file)" : "no @font-face rules captured"}`);
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
L.push(`- scroll-linked elements: ${motion.scroll_linked.length} · one-shot reveals: ${motion.reveals.length} · pinned: ${motion.pinned.length} · fixed UI: ${motion.fixed.length}${motion.split_text ? ` · split-text parts revealed: ${motion.split_text.parts_animated} (${motion.split_text.props.join(", ")})` : ""}${motion.split_scroll ? ` · split-text parts scrubbed: ${motion.split_scroll.reduce((a, g) => a + g.parts, 0)}` : ""}`);
motion.pinned.slice(0, 6).forEach((p) => L.push(`- PINNED ${p.el} "${p.text}" .${p.cls.split(" ")[0]} for ${p.steps_pinned} steps`));
(motion.split_scroll || []).forEach((g) => L.push(`- SCROLL-SCRUBBED SPLIT TEXT .${g.cls} "${g.text}": ${g.parts} parts, ${g.props.join("+")}, offsets x ${g.tx.join("…")}px y ${g.ty.join("…")}px, each scrubbed to its rest position (per-part scatter, not one block)`));
motion.scroll_linked.slice(0, 12).forEach((p) => L.push(`- SCROLL-LINKED ${p.el} "${p.text}" .${p.cls.split(" ")[0]}: ${p.props.join("+")} (x ${p.range.tx.join("→")}px, y ${p.range.ty.join("→")}px, scale ${p.range.scale.join("→")})`));
motion.reveals.slice(0, 14).forEach((p) => L.push(`- REVEAL ${p.el} "${p.text}" @step ${p.at_step}: ${p.prop} ${p.from.transform !== p.to.transform ? `${p.from.transform.slice(0, 40)} → ${p.to.transform.slice(0, 40)}` : ""} opacity ${p.from.opacity}→${p.to.opacity}${p.from.clip ? ` clip ${p.from.clip.slice(0, 40)} → ${String(p.to.clip).slice(0, 40)}` : ""} · ${typeof p.timing === "string" ? p.timing : `${p.timing.duration_ms}ms ${p.timing.ease}`}`));
L.push("", "## Hover & cursor");
L.push(`- cursor: ${cursor.custom_cursor ? `CUSTOM ${JSON.stringify(cursor.elements[0])}` : `native (${cursor.css_cursor})`}`);
hovers.slice(0, 12).forEach((h) => L.push(`- ${h.el} "${h.text}": ${h.changes.join(" | ")}`));
L.push("", "## States", ...(states.length ? states.map((s) => `- ${s.trigger}: ${s.frames.join(", ")}`) : ["- no menu/tab toggles found"]));
if (!transitions.length) L.push("- no internal link to test a page transition");
transitions.forEach((t, i) => L.push(`- PAGE TRANSITION ${i + 1} → ${t.to} (${t.client_side ? "client-side, SPA-style: look for barba/taxi/View Transitions/router + GSAP" : "full page load"}): ${t.frames.join(", ")} · back: ${t.back.join(", ")}`));
L.push("", "## Pointer (mouse probe: 4 corners vs centre, ambient changes excluded)");
if (!pointer.length) L.push("- not probed");
pointer.forEach((p) => L.push(`- ${p.at}: reacts in [${p.reactive_cells.join(", ") || "none"}]${p.ambient_cells.length ? ` · animates by itself in [${p.ambient_cells.join(", ")}]` : ""}${p.moved_elements.length ? ` · elements that move with the mouse (parallax/magnetic): ${p.moved_elements.join("; ")}` : ""}`));
L.push("", "## Motion PATHS (reproduce these exactly: shape, centre, radius, sweep, direction vs scroll; not a generic float)");
{ const dom = motion.scroll_linked.filter((p) => p.path); const tr = threeTraj;
  if (!dom.length && !tr.objects.some((o) => o.shape !== "line/drift") && !tr.camera?.moves) L.push("- no curved paths measured (everything moves in straight lines or not at all)");
  dom.slice(0, 10).forEach((p) => L.push(`- DOM ${p.el} "${p.text.slice(0, 30)}" .${p.cls.split(" ")[0]}: ${p.path.shape}, sweep ${p.path.sweep_deg}° ${p.path.direction}, centre ${p.path.center} r ${p.path.radius}px (Δr ${p.path.radius_change}), points ${JSON.stringify(p.path.points).slice(0, 160)}`));
  tr.objects.filter((o) => o.shape !== "line/drift").forEach((o) => L.push(`- WebGL ${o.count}× ${o.kind}${o.names.length ? ` (${o.names.join(", ")})` : ""}: ${o.shape}, sweep ~${o.sweep_deg}° ${o.direction}, centre ${o.center} r ~${o.radius}${o.unit === "px" ? "px on screen" : " world units"}${o.spin ? ", spins while travelling" : ""} · example ${JSON.stringify(o.example_points).slice(0, 140)}`));
  if (tr.camera?.moves) L.push(`- CAMERA moves ${JSON.stringify(tr.camera.start)} → ${JSON.stringify(tr.camera.end)}${tr.camera.path_xz && tr.camera.path_xz.shape !== "line/drift" ? ` · ${tr.camera.path_xz.shape} in x/z, sweep ${tr.camera.path_xz.sweep_deg}°` : " (dolly/track)"}`);
}
L.push("", "## WebGL / three.js");
if (three) {
  three.renderers.forEach((r) => L.push(`- renderer: toneMapping ${r.toneMapping}, exposure ${r.exposure}, ${r.colorSpace}, shadows ${r.shadows}, dpr ${r.pixelRatio}, ${r.info ? `${r.info.calls} draw calls, ${r.info.triangles} tris, ${r.info.programs} programs` : ""}`));
  three.scenes.forEach((s, n) => {
    L.push(`- scene ${n}: bg ${s.background}, env ${s.environment}, fog ${s.fog ? JSON.stringify(s.fog) : "none"}, objects ${JSON.stringify(s.counts)}`);
    s.lights.forEach((l) => L.push(`  - light ${l.type} ${l.color} ×${l.intensity} at [${l.pos}]${l.castShadow ? " shadows" : ""}`));
    s.materials.slice(0, 10).forEach((m) => L.push(`  - material ${m.type}${m.name ? ` "${m.name}"` : ""}: color ${m.color} rough ${m.roughness} metal ${m.metalness}${m.transmission ? ` transmission ${m.transmission} ior ${m.ior} thickness ${m.thickness}` : ""}${m.clearcoat ? ` clearcoat ${m.clearcoat}` : ""}${m.emissive && m.emissive !== "#000000" ? ` emissive ${m.emissive}` : ""} maps [${m.maps}]${m.customShader ? ` CUSTOM SHADER uniforms [${m.uniforms}]` : ""}`));
    s.meshes.slice(0, 8).forEach((m) => L.push(`  - ${m.type} ${m.geometry} ${m.verts} verts${m.instanced ? ` ×${m.instanced} instances` : ""} (${m.material})`));
  });
} else L.push(`- no three.js scene observed${stackNow.canvases.some((c) => c.ctx.includes("webgl")) ? " — but a WebGL canvas exists: read shaders/custom-* (OGL / raw WebGL / Spline / other)" : ""}`);
L.push(`- shaders captured: ${shaders.length} (${custom} custom → shaders/custom-*). Custom shaders ARE the look: port them, don't approximate.`);
L.push("", "## Assets (network)", `${assetList.filter((a) => !a.saved && a.kind !== "image").length ? `NOT saved (fetch from assets.json url): ${assetList.filter((a) => !a.saved && a.kind !== "image").map((a) => a.url.split("/").pop()).slice(0, 8).join(", ")}. ` : ""}assets.json maps every saved file to its source URL. Files keep the last two URL segments in their name (image-<dir>-<file>-<hash>.webp): use that to put the right photo in the right place.`);
for (const k of ["font", "model", "hdri", "rive", "json", "video", "audio", "image"]) {
  const a = byKind(k); if (!a.length) continue;
  L.push(`- ${k} (${a.length}): ${a.sort((x, y) => (y.bytes || 0) - (x.bytes || 0)).slice(0, k === "image" ? 8 : 10).map((x) => `${x.saved || x.url.split("/").pop().slice(0, 50)}${x.bytes ? ` ${(x.bytes / 1024).toFixed(0)}KB` : ""}`).join(", ")}`);
}
L.push("", `## Pages (${pages.length} crawled of ${seen.size} internal URLs found)`, ...pages.map((p) => p.error ? `- ${p.url}: ERROR ${p.error}` : `- ${p.url} → pages/${p.slug}/s*.jpg (${p.screenshots} shots, ${(p.docHeight / VH).toFixed(1)} screens${p.canvases ? `, ${p.canvases} canvas` : ""})`));
L.push("", "## Evidence to LOOK at (in this order)", "1. intro/t*.jpg (the first 7 seconds)", `2. scroll-sheet-*.png (${frames.length} frames of one continuous scroll, 5×4 per sheet, read left→right, top→bottom)`, "3. steps/s*.jpg for exact frames per half-screen", "4. states/*.jpg (menu, hover, pointer, every transition)", "5. pages/*/s*.jpg", "6. progress/p*.png: frames by scroll progress (0–100%), used by `vf feel` to pair reference and build");
save("teardown.md", L.join("\n"));
return L.join("\n");
}
