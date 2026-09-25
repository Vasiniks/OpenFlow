#!/usr/bin/env node
// feel.mjs — does the build FEEL like the reference? Compares two `vf teardown` folders.
// Usage: vf feel <refTeardownDir> <buildTeardownDir> --out <dir>
// Writes <out>/feel.md (mechanism parity table + parity %) and side-by-side sheets (reference LEFT, build RIGHT):
//   feel-intro.png (same ms after load), feel-scroll-NN.png (same scroll progress), feel-transition.png, feel-states.png
// Pixel/layout similarity is `vf compare`'s job; this is about motion, interaction, 3D and asset parity.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const [refDir, curDir] = process.argv.slice(2);
const oi = process.argv.indexOf("--out"); const OUT = oi > -1 ? process.argv[oi + 1] : join(curDir || ".", "feel");
if (!refDir || !curDir) { console.error("usage: vf feel <refTeardownDir> <buildTeardownDir> --out <dir>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const J = (d, f, def = {}) => { try { return JSON.parse(readFileSync(join(d, f), "utf8")); } catch { return def; } };
const R = { stack: J(refDir, "stack.json"), motion: J(refDir, "motion.json"), hover: J(refDir, "hover.json"), three: J(refDir, "three.json"), assets: J(refDir, "assets.json", []) };
const C = { stack: J(curDir, "stack.json"), motion: J(curDir, "motion.json"), hover: J(curDir, "hover.json"), three: J(curDir, "three.json"), assets: J(curDir, "assets.json", []) };
// No stack.json = the teardown never got past its first phase. Refuse rather than report a meaningless parity.
for (const d of [refDir, curDir]) if (!existsSync(join(d, "stack.json"))) { console.error(`vf feel: ${d}/stack.json missing: that teardown did not finish its main pass. Re-run \`vf teardown\` (it writes results within --budget, default 480 s) and check its teardown.md.`); process.exit(3); }
const cut = [[refDir, R], [curDir, C]].filter(([, x]) => (x.stack.phases_cut || []).length).map(([d, x]) => `${d}: ${x.stack.phases_cut.join("; ")}`);

// ------------------------------------------------------------------------------------------------ parity table
const rows = [];
// status: ✓ matched · ~ partial · ✗ missing · = not applicable (reference doesn't have it)
const count = (name, r, c, note = "") => { const st = !r ? (c ? "extra" : "=") : c >= r * 0.7 ? "✓" : c >= r * 0.3 ? "~" : "✗"; rows.push({ name, ref: r ?? 0, cur: c ?? 0, st, note }); };
const bool = (name, r, c, note = "") => rows.push({ name, ref: r ? "yes" : "no", cur: c ? "yes" : "no", st: !r ? (c ? "extra" : "=") : c ? "✓" : "✗", note });
const set = (name, r, c, note = "") => { const a = new Set(r), b = new Set(c), hit = [...a].filter((x) => b.has(x)).length; rows.push({ name, ref: [...a].join(", ") || "—", cur: [...b].join(", ") || "—", st: !a.size ? (b.size ? "extra" : "=") : hit / a.size >= 0.6 ? "✓" : hit ? "~" : "✗", note }); };
const libs = (x) => x.stack.stack?.libs || {};
const kw = (x) => x.stack.bundles?.keyword_hits || {};
const eases = (x) => (x.stack.bundles?.gsap_eases || []).slice(0, 4).map(([e]) => e.replace(/\(.*\)/, "").replace(/\.(out|in|inOut)$/, "")).filter((e) => e !== "none");
const median = (arr) => { const v = arr.flatMap(([d, n]) => Array(Math.min(n, 20)).fill(+d)).filter((x) => x > 0.05 && x < 5).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
const smooth = (x) => (libs(x).lenis ? "lenis" : libs(x).locomotive ? "locomotive" : x.stack.virtual_scroll ? "virtual (transform)" : kw(x).ScrollSmoother ? "ScrollSmoother?" : "native");
const hoverKinds = (x) => [...new Set((x.hover.hovers || []).flatMap((h) => h.changes.map((c) => (/transform: .*y-?\d/.test(c) ? "text/element roll (translateY)" : /transform: .*s\d/.test(c) ? "scale" : /clip-path/.test(c) ? "clip" : /underline|border/.test(c) ? "underline/border draw" : /color|background/.test(c) ? "colour" : /opacity/.test(c) ? "fade" : "other"))))];
const pointerCells = (x) => [...new Set((x.stack.pointer || []).flatMap((p) => p.reactive_cells))];
const pointerEls = (x) => (x.stack.pointer || []).flatMap((p) => p.moved_elements).length;
const three = (x) => x.three?.renderers ? x.three : null;
const lights = (x) => (three(x)?.scenes || []).reduce((n, s) => n + (s.lights?.length || 0), 0);
const matTypes = (x) => [...new Set((three(x)?.scenes || []).flatMap((s) => (s.materials || []).map((m) => m.type)))];
const shaderCount = (d) => (existsSync(join(d, "shaders")) ? readdirSync(join(d, "shaders")).filter((f) => f.startsWith("custom-")).length : 0);
// "Family weight style" → a family key. Self-hosted copies get renamed ("tazugane" vs "TazuganeGothicStdN-Regular"),
// so compare the first 7 letters, lowercased. Obfuscated webfont names (fpbf_…) and generic fallbacks are dropped.
const fams = (x) => [...new Set((x.stack.stack?.fonts || []).map((f) => f.replace(/\s+\S+\s+\S+$/, "").replace(/\s*Fallback$/i, "").trim())
  .filter((f) => f && !/^(GeistSans|Geist|Arial|Helvetica|fpbf_\w+)$/i.test(f)).map((f) => f.toLowerCase().replace(/[^a-z]/g, "").slice(0, 7)))];
const akind = (x, k) => x.assets.filter((a) => a.kind === k).length;

bool("smooth scroll", smooth(R) !== "native", smooth(C) !== "native", `${smooth(R)} → ${smooth(C)}`);
count("GSAP-animated elements (runtime)", libs(R).gsap_animated_elements || 0, libs(C).gsap_animated_elements || 0, "elements GSAP actually touched, not keyword presence");
count("intro sequence (ms until content)", R.stack.intro_ready_ms || 0, C.stack.intro_ready_ms || 0, "similar length = similar entrance");
count("split-text blocks", libs(R).split_text_blocks || 0, libs(C).split_text_blocks || 0);
count("one-shot reveals", (R.motion.reveals || []).length + (R.motion.split_text ? 1 : 0), (C.motion.reveals || []).length + (C.motion.split_text ? 1 : 0));
count("scroll-linked elements", (R.motion.scroll_linked || []).length, (C.motion.scroll_linked || []).length);
count("scroll-scrubbed split text", (R.motion.split_scroll || []).length, (C.motion.split_scroll || []).length);
// pacing: the same story needs about the same scroll distance, or every pin and scrub runs too fast (or too slow)
{ const scr = (x) => +(((x.stack.stack?.docHeight) || 0) / 900).toFixed(1), r = scr(R), c = scr(C), d = r ? Math.abs(c - r) / r : 0;
  rows.push({ name: "home page length (screens)", ref: r, cur: c, st: !r ? "=" : d <= 0.15 ? "✓" : d <= 0.35 ? "~" : "✗", note: "within ±15% = same pacing" }); }
count("pinned sections", Math.max((R.motion.pinned || []).length, libs(R).scrolltrigger?.pins || 0), Math.max((C.motion.pinned || []).length, libs(C).scrolltrigger?.pins || 0));
set("easing vocabulary (top GSAP eases)", eases(R), eases(C));
count("typical duration (s, median)", median(R.stack.bundles?.durations || []), median(C.stack.bundles?.durations || []), "compare the numbers, not the ratio");
count("hover effects", (R.hover.hovers || []).length, (C.hover.hovers || []).length);
set("hover kinds", hoverKinds(R), hoverKinds(C));
bool("custom cursor", R.hover.cursor?.custom_cursor, C.hover.cursor?.custom_cursor);
set("pointer-reactive regions", pointerCells(R), pointerCells(C), "mouse moves → the page reacts (WebGL/shader)");
count("elements moving with the mouse", pointerEls(R), pointerEls(C), "parallax / magnetic");
count("page transitions filmed", (R.stack.transitions || []).length, (C.stack.transitions || []).length);
bool("client-side (animated) navigation", (R.stack.transitions || []).some((t) => t.client_side), (C.stack.transitions || []).some((t) => t.client_side));
bool("WebGL / three.js", three(R) || (R.stack.stack?.canvases || []).some((c) => /webgl/.test(c.ctx)), three(C) || (C.stack.stack?.canvases || []).some((c) => /webgl/.test(c.ctx)));
count("three.js lights", lights(R), lights(C));
set("material types", matTypes(R), matTypes(C));
count("custom shaders", shaderCount(refDir), shaderCount(curDir), "the reference's own GLSL should be ported");
set("font families", fams(R), fams(C));
count("images", akind(R, "image"), akind(C, "image"));
count("video", akind(R, "video"), akind(C, "video"));
count("3D models", akind(R, "model"), akind(C, "model"));
count("lottie / rive", akind(R, "json") + akind(R, "rive"), akind(C, "json") + akind(C, "rive"));
count("pages", (R.stack.pages || []).length + 1, (C.stack.pages || []).length + 1);

const scored = rows.filter((r) => ["✓", "~", "✗"].includes(r.st));
const parity = scored.length ? Math.round((100 * scored.reduce((a, r) => a + (r.st === "✓" ? 1 : r.st === "~" ? 0.5 : 0), 0)) / scored.length) : 100;

// ------------------------------------------------------------------------------------------------ side-by-side sheets
const read = (f) => { const b = readFileSync(f); return extname(f) === ".png" ? PNG.sync.read(b) : (() => { const j = jpeg.decode(b, { useTArray: true }); return { width: j.width, height: j.height, data: j.data }; })(); };
function sheet(pairs, file, w = 560) { // pairs: [label, refFile|null, curFile|null]
  if (!pairs.length) return null;
  const h = Math.round((w * 900) / 1440), gap = 12, labelH = 0, W = w * 2 + gap * 3, H = pairs.length * (h + gap) + gap;
  const o = new PNG({ width: W, height: H }); o.data.fill(255);
  pairs.forEach(([, a, b], row) => [a, b].forEach((f, col) => {
    const ox = gap + col * (w + gap), oy = gap + row * (h + gap) + labelH;
    if (!f || !existsSync(f)) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const di = ((oy + y) * W + ox + x) * 4; const s = (x + y) % 24 < 12 ? 235 : 215; o.data[di] = o.data[di + 1] = o.data[di + 2] = s; o.data[di + 3] = 255; } return; }  // hatched = missing
    const im = read(f), sx = im.width / w, sy = im.height / h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const si = (Math.floor(y * sy) * im.width + Math.floor(x * sx)) * 4, di = ((oy + y) * W + ox + x) * 4; o.data[di] = im.data[si]; o.data[di + 1] = im.data[si + 1]; o.data[di + 2] = im.data[si + 2]; o.data[di + 3] = 255; }
  }));
  writeFileSync(join(OUT, file), PNG.sync.write(o)); return file;
}
const ls = (d, re) => (existsSync(d) ? readdirSync(d).filter((f) => re.test(f)).sort() : []);
const made = [];
// intro: same milliseconds
const introT = ls(join(refDir, "intro"), /^t\d+ms\.jpg$/);
made.push(sheet(introT.map((f) => [f, join(refDir, "intro", f), join(curDir, "intro", f)]), "feel-intro.png"));
// scroll: same progress
const prog = (d) => ls(join(d, "progress"), /^p\d{3}\.png$/).map((f) => [+f.slice(1, 4), join(d, "progress", f)]);
const rp = prog(refDir), cp = prog(curDir);
const pairs = rp.map(([p, f]) => [p, f, cp.length ? cp.reduce((a, b) => (Math.abs(b[0] - p) < Math.abs(a[0] - p) ? b : a))[1] : null]);
const step = Math.max(1, Math.ceil(pairs.length / 24));
const chosen = pairs.filter((_, i) => i % step === 0);
for (let s = 0; s * 6 < chosen.length; s++) made.push(sheet(chosen.slice(s * 6, s * 6 + 6), `feel-scroll-${String(s + 1).padStart(2, "0")}.png`));
// transition + states
const tr = ls(join(refDir, "states"), /^transition1-\d+ms\.jpg$/);
made.push(sheet(tr.map((f) => [f, join(refDir, "states", f), join(curDir, "states", f)]), "feel-transition.png"));
const st = ["hover-example.jpg", "pointer-top-corner.png"].filter((f) => existsSync(join(refDir, "states", f)));
made.push(sheet(st.map((f) => [f, join(refDir, "states", f), join(curDir, "states", f)]), "feel-states.png"));

// ------------------------------------------------------------------------------------------------ report
const missing = rows.filter((r) => r.st === "✗").map((r) => r.name), partial = rows.filter((r) => r.st === "~").map((r) => r.name);
const L = [`# Feel parity: build vs reference`, "", `**Mechanism parity: ${parity}%** (${scored.filter((r) => r.st === "✓").length} matched · ${partial.length} partial · ${missing.length} missing of ${scored.length} mechanisms the reference uses)`, ""];
if (cut.length) L.push(`**Partial teardown** (rows that depend on the missing phases undercount): ${cut.join(" · ")}`, "");
L.push("A build is not \"close\" while anything below is ✗. Pixel similarity (`vf compare`) cannot see motion, interaction, transitions or 3D; this table can.", "");
L.push("| mechanism | reference | build | status | note |", "|---|---|---|---|---|");
for (const r of rows) L.push(`| ${r.name} | ${r.ref} | ${r.cur} | ${r.st} | ${r.note} |`);
L.push("", `**Missing:** ${missing.join(", ") || "none"}`, `**Partial:** ${partial.join(", ") || "none"}`, "");
L.push("## Look at these (reference LEFT, build RIGHT; hatched = not captured)", ...made.filter(Boolean).map((f) => `- ${f}`));
L.push("", "Judge in this order: 1) broad: pacing, section rhythm, composition, what's on screen at each progress; 2) motion: does each moment move the same way, as fast, with the same ease; 3) details: hovers, cursor, transitions, material/light.");
writeFileSync(join(OUT, "feel.md"), L.join("\n"));
writeFileSync(join(OUT, "feel.json"), JSON.stringify({ parity, rows, missing, partial, sheets: made.filter(Boolean) }, null, 1));
console.log(L.join("\n"));
