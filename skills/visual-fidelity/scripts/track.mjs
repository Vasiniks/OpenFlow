#!/usr/bin/env node
// track.mjs — trend + regression guard across iterations.
// Usage: vf track <curRoot>      (e.g. .design/cur, containing iter-1/compare/compare.json, iter-2/…)
// Prints per-viewport: pixel mismatch, sum of top-3 impacts, matched, and marks BEST and REGRESSION
// (worse than best by >10% relative on either metric). Exit code 3 if the latest iteration regressed.
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || ".design/cur";
const iters = readdirSync(root).filter((d) => /^iter-\d+$/.test(d)).sort((a, b) => +a.slice(5) - +b.slice(5));
const rows = {}; // label -> [{iter, mism, impact, matched}]
for (const it of iters) {
  const f = join(root, it, "compare", "compare.json");
  if (!existsSync(f)) continue;
  for (const e of JSON.parse(readFileSync(f)).labels) {
    const impact = +(e.top_deltas || []).slice(0, 3).reduce((s, m) => s + m.impact, 0).toFixed(2);
    (rows[e.label] ||= []).push({ iter: it, mism: e.pixel_mismatch_pct, impact, matched: e.matched ?? "-", omissions: (e.omissions || []).length });
  }
}
// Rank by pixel mismatch first (can't be gamed by stretching boxes), element impact breaks ties.
const score = (r) => r.mism * 100 + r.impact;
let regressed = false;
const out = ["# Iteration trend (lower is better)", ""];
for (const [label, rs] of Object.entries(rows)) {
  const best = rs.reduce((b, r) => (score(r) < score(b) ? r : b), rs[0]);
  out.push(`## ${label}`, "", "| iter | pixel mismatch % | top-3 impact | matched | omissions | status |", "|---|---|---|---|---|---|");
  for (const r of rs) {
    const worse = r !== best && (r.mism > best.mism * 1.1 + 0.05 || r.impact > best.impact * 1.1 + 0.1);
    const status = r === best ? "**BEST**" : worse ? "REGRESSION vs best" : "";
    out.push(`| ${r.iter} | ${r.mism} | ${r.impact} | ${r.matched} | ${r.omissions} | ${status} |`);
  }
  const last = rs[rs.length - 1];
  if (last !== best && (last.mism > best.mism * 1.1 + 0.05 || last.impact > best.impact * 1.1 + 0.1)) {
    regressed = true;
    out.push("", `**Latest (${last.iter}) regressed vs ${best.iter}.** Attribute it: \`vf compare ${root}/${best.iter} ${root}/${last.iter} --out ${root}/${last.iter}/vs-best\`, then revert or redo the changes that caused it.`);
  }
  out.push("");
}
writeFileSync(join(root, "trend.md"), out.join("\n"));
console.log(out.join("\n"));
process.exit(regressed ? 3 : 0);
