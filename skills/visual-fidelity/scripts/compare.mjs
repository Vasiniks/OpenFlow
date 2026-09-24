#!/usr/bin/env node
// compare.mjs — reference capture vs current capture → numbers the critic can act on.
// Usage: vf compare <refDir> <curDir> --out <dir>
// Works label-by-label (e.g. 1440x900, 390x844@50). If a ref label has only a PNG (screenshot-only
// reference), pixel analysis still runs; element deltas need both JSON reports.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [refDir, curDir] = process.argv.slice(2);
const oi = process.argv.indexOf("--out");
const out = oi > -1 ? process.argv[oi + 1] : join(curDir, "compare");
if (!refDir || !curDir) { console.error("usage: compare <refDir> <curDir> --out <dir>"); process.exit(2); }
mkdirSync(out, { recursive: true });

const readPng = (p) => PNG.sync.read(readFileSync(p));
const crop = (img, w, h) => { // top-left crop so different heights still compare the viewport region
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) img.data.copy(o.data, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
  return o;
};
const words = (s) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1));
const sim = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(A.size, B.size); };
const parseRgb = (c) => (c && c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
// next/font and bundlers rename families ("__Panchang_a1b2c3", "lenisPanchang", "Panchang Fallback"); compare the core name.
const famKey = (f) => (f || "").toLowerCase().replace(/^_+|_[a-f0-9]{4,}$|\s*fallback$/g, "").replace(/[^a-z0-9]/g, "");
const sameFamily = (a, b) => { const x = famKey(a), y = famKey(b); return x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y)); };
const cdist = (a, b) => { const [p, q] = [parseRgb(a), parseRgb(b)]; if (p.length < 3 || q.length < 3) return null; return Math.round(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); };

const labels = readdirSync(refDir).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).filter((l) => existsSync(join(curDir, `${l}.png`)));
const report = { labels: [] };
for (const label of labels) {
  const a0 = readPng(join(refDir, `${label}.png`)), b0 = readPng(join(curDir, `${label}.png`));
  const w = Math.min(a0.width, b0.width), h = Math.min(a0.height, b0.height);
  const a = crop(a0, w, h), b = crop(b0, w, h), diff = new PNG({ width: w, height: h });
  const mism = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.15, includeAA: false, alpha: 0.35 });
  writeFileSync(join(out, `${label}.diff.png`), PNG.sync.write(diff));
  // side-by-side: ref | gap | current
  const gap = 16, sbs = new PNG({ width: w * 2 + gap, height: h });
  sbs.data.fill(255);
  for (let y = 0; y < h; y++) { a.data.copy(sbs.data, (y * sbs.width) * 4, y * w * 4, (y + 1) * w * 4); b.data.copy(sbs.data, (y * sbs.width + w + gap) * 4, y * w * 4, (y + 1) * w * 4); }
  writeFileSync(join(out, `${label}.side-by-side.png`), PNG.sync.write(sbs));
  // where: 3 columns x 6 rows grid of mismatch %
  const cols = 3, rows = 6, grid = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(c * w / cols), x1 = Math.floor((c + 1) * w / cols), y0 = Math.floor(r * h / rows), y1 = Math.floor((r + 1) * h / rows);
    let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (diff.data[i] === 255 && diff.data[i + 1] === 0) n++; }
    grid.push({ cell: `r${r + 1}c${c + 1}`, region: `${["top", "upper", "upper-mid", "lower-mid", "lower", "bottom"][r]}-${["left", "center", "right"][c]}`, pct: +(100 * n / ((x1 - x0) * (y1 - y0))).toFixed(1) });
  }
  const entry = { label, size: `${w}x${h}`, pixel_mismatch_pct: +(100 * mism / (w * h)).toFixed(2), hotspots: grid.sort((x, y) => y.pct - x.pct).slice(0, 5) };

  const rj = join(refDir, `${label}.json`), cj = join(curDir, `${label}.json`);
  if (existsSync(rj) && existsSync(cj)) {
    const R = JSON.parse(readFileSync(rj)), C = JSON.parse(readFileSync(cj));
    const used = new Set(), matches = [], omissions = [];
    for (const re of R.elements) {
      let best = null, bs = 0;
      C.elements.forEach((ce, i) => {
        if (used.has(i) || ce.role !== re.role) return;
        // Non-text elements only pair when near each other and of comparable size; otherwise far-apart icons
        // (e.g. a hidden-menu glyph vs a CTA icon) get cross-matched and inflate impact.
        if (re.role !== "text") {
          const dist = Math.hypot(re.vw.x - ce.vw.x, re.vh.y - ce.vh.y);
          const sizeRatio = Math.max(re.area_pct, ce.area_pct) / Math.max(0.01, Math.min(re.area_pct, ce.area_pct));
          if (dist > 20 || sizeRatio > 4 || (re.tag !== ce.tag && re.role === "media")) return;
        }
        let s = re.role === "text" ? sim(re.text, ce.text) : 0.5 - Math.abs(re.area_pct - ce.area_pct) / 100 - Math.hypot(re.vw.x - ce.vw.x, re.vh.y - ce.vh.y) / 400;
        if (s > bs) { bs = s; best = i; }
      });
      if (best !== null && (re.role !== "text" ? bs > 0.2 : bs >= 0.5)) {
        used.add(best); const ce = C.elements[best];
        const m = { ref: `${re.tag}${re.text ? ` "${re.text.slice(0, 32)}"` : ""}`, dx_vw: +(ce.vw.x - re.vw.x).toFixed(1), dy_vh: +(ce.vh.y - re.vh.y).toFixed(1),
          w_ratio: +(ce.box.w / Math.max(1, re.box.w)).toFixed(2), h_ratio: +(ce.box.h / Math.max(1, re.box.h)).toFixed(2), ref_area_pct: re.area_pct };
        if (re.font && ce.font) Object.assign(m, { font_size: `${re.font.size}→${ce.font.size}px`, font_ratio: +(ce.font.size / re.font.size).toFixed(2),
          weight: re.font.weight !== ce.font.weight ? `${re.font.weight}→${ce.font.weight}` : undefined, family: !sameFamily(re.font.family, ce.font.family) ? `${re.font.family}→${ce.font.family}` : undefined,
          ls: re.font.ls !== ce.font.ls ? `${re.font.ls}→${ce.font.ls}` : undefined, color_dist: cdist(re.font.color, ce.font.color) });
        // impact = how visible x how wrong
        const dev = Math.abs(m.dx_vw) / 10 + Math.abs(m.dy_vh) / 10 + Math.abs(1 - m.w_ratio) + Math.abs(1 - m.h_ratio) + (m.font_ratio ? Math.abs(1 - m.font_ratio) * 2 : 0) + (m.family ? 0.5 : 0) + (m.ls ? 1 : 0) + (m.weight ? 0.5 : 0); // tracking/weight hacks can't buy a good box score
        m.impact = +(dev * Math.sqrt(re.area_pct + 0.5)).toFixed(2);
        matches.push(m);
      } else if (re.area_pct >= 0.3 || (re.font && re.font.size >= 24)) omissions.push({ ref: `${re.tag} ${re.role}${re.text ? ` "${re.text.slice(0, 40)}"` : ""}`, at: `x${re.vw.x}vw y${re.vh.y}vh`, size: `${re.vw.w}vw×${re.vh.h}vh`, area_pct: re.area_pct });
    }
    const extras = C.elements.filter((_, i) => !used.has(i)).filter((e) => e.area_pct >= 0.5 || (e.font && e.font.size >= 24))
      .map((e) => ({ cur: `${e.tag} ${e.role}${e.text ? ` "${e.text.slice(0, 40)}"` : ""}`, at: `x${e.vw.x}vw y${e.vh.y}vh`, size: `${e.vw.w}vw×${e.vh.h}vh`, area_pct: e.area_pct, radius: e.radius, bg: e.bg?.image ? "gradient/image" : e.bg?.color }));
    Object.assign(entry, {
      page: { ref_docHeight: R.docHeight, cur_docHeight: C.docHeight, ref_bg: R.bodyBg, cur_bg: C.bodyBg, ref_fonts: R.fontsLoaded.slice(0, 5), cur_fonts: C.fontsLoaded.slice(0, 5), cur_overflow_px: C.hScrollOverflow, cur_errors: C.errors.length },
      top_deltas: matches.sort((x, y) => y.impact - x.impact).slice(0, 12),
      omissions: omissions.sort((x, y) => y.area_pct - x.area_pct).slice(0, 10),
      extras: extras.sort((x, y) => y.area_pct - x.area_pct).slice(0, 10),
      matched: `${matches.length}/${R.elements.length}`,
    });
  }
  report.labels.push(entry);
}
writeFileSync(join(out, "compare.json"), JSON.stringify(report, null, 1));
// compact markdown for agents
const md = ["# Visual compare", ""];
for (const e of report.labels) {
  md.push(`## ${e.label}  · pixel mismatch ${e.pixel_mismatch_pct}%  · matched ${e.matched ?? "n/a (image-only ref)"}`);
  md.push(`hotspots: ${e.hotspots.map((h) => `${h.region} ${h.pct}%`).join(" · ")}`);
  md.push(`images: ${e.label}.side-by-side.png, ${e.label}.diff.png`);
  if (e.page) md.push(`page: docHeight ${e.page.ref_docHeight}→${e.page.cur_docHeight}px · bg ${e.page.ref_bg}→${e.page.cur_bg} · fonts [${e.page.ref_fonts}]→[${e.page.cur_fonts}] · overflow ${e.page.cur_overflow_px}px · errors ${e.page.cur_errors}`);
  if (e.top_deltas?.length) { md.push("", "| element | Δx vw | Δy vh | w× | h× | font | other | impact |", "|---|---|---|---|---|---|---|---|");
    for (const m of e.top_deltas) md.push(`| ${m.ref} | ${m.dx_vw} | ${m.dy_vh} | ${m.w_ratio} | ${m.h_ratio} | ${m.font_size ?? ""} | ${[m.family, m.weight, m.ls, m.color_dist ? `Δcolor ${m.color_dist}` : ""].filter(Boolean).join(", ")} | ${m.impact} |`); }
  if (e.omissions?.length) md.push("", "**Omitted (in ref, missing in current):** " + e.omissions.map((o) => `${o.ref} @${o.at} ${o.size}`).join("; "));
  if (e.extras?.length) md.push("", "**Extra (in current, not matched in ref — justify or remove):** " + e.extras.map((o) => `${o.cur} @${o.at} ${o.size}${o.bg ? ` bg:${o.bg}` : ""}`).join("; "));
  md.push("");
}
writeFileSync(join(out, "compare.md"), md.join("\n"));
console.log(md.join("\n"));
