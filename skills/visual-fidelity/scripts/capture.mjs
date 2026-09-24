#!/usr/bin/env node
// capture.mjs — render a URL at fixed viewports and extract a measured layout report.
// Usage: vf capture <url> --out <dir> [--viewports 1440x900,390x844] [--scroll 0,0.5] [--wait 1500]
//                     [--reduced-motion] [--full]
// Output per viewport+scroll: <label>.png + <label>.json (salient elements in px AND vw/vh units).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
if (!url || url.startsWith("--")) { console.error("usage: capture <url> --out <dir> [--viewports WxH,...] [--scroll 0,0.5] [--wait ms] [--reduced-motion] [--full]"); process.exit(2); }

const out = opt("out", "./vf-out");
const viewports = opt("viewports", "1440x900,390x844").split(",").map((s) => s.split("x").map(Number));
const scrolls = opt("scroll", "0").split(",").map(Number); // fractions of scrollable height
const wait = Number(opt("wait", "1500"));
mkdirSync(out, { recursive: true });

// Runs in the page: collect salient visible elements with geometry + computed style.
function extract() {
  const vw = innerWidth, vh = innerHeight, sy = scrollY;
  const rgb = (c) => c;
  const visible = (el, r, cs) => r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05 &&
    r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
  const items = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, r, cs)) continue;
    const tag = el.tagName.toLowerCase();
    const text = ownText(el);
    const media = ["img", "video", "canvas", "svg", "picture", "iframe"].includes(tag);
    const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
    const area = (Math.min(r.right, vw) - Math.max(r.left, 0)) * (Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const big = area / (vw * vh) >= 0.01 || (area / (vw * vh) >= 0.2 && cs.borderRadius !== "0px");
    const textish = text.length > 0 && parseFloat(cs.fontSize) >= 12;
    if (!(media || textish || (bg && big))) continue;
    items.push({
      tag, role: media ? "media" : textish ? "text" : "box",
      text: text.slice(0, 60),
      box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      vw: { x: +(100 * r.left / vw).toFixed(1), w: +(100 * r.width / vw).toFixed(1) },
      vh: { y: +(100 * r.top / vh).toFixed(1), h: +(100 * r.height / vh).toFixed(1) },
      area_pct: +(100 * area / (vw * vh)).toFixed(2),
      font: textish ? { family: cs.fontFamily.split(",")[0].replace(/["']/g, ""), size: parseFloat(cs.fontSize), weight: cs.fontWeight,
        lh: cs.lineHeight, ls: cs.letterSpacing, transform: cs.textTransform, color: rgb(cs.color), align: cs.textAlign } : undefined,
      bg: bg ? { color: cs.backgroundColor, image: cs.backgroundImage === "none" ? undefined : cs.backgroundImage.slice(0, 80) } : undefined,
      fill: tag === "svg" ? (() => { const s = el.querySelector("path,rect,circle,polygon,text,use"); const f = s ? getComputedStyle(s).fill : cs.fill; return f && f !== "none" ? f : cs.color; })() : undefined,
      radius: cs.borderRadius !== "0px" ? cs.borderRadius : undefined,
      z: cs.zIndex !== "auto" ? cs.zIndex : undefined,
      position: ["fixed", "sticky", "absolute"].includes(cs.position) ? cs.position : undefined,
    });
  }
  // Keep the most salient: all media + largest text + largest boxes (cap for readability).
  const media = items.filter((i) => i.role === "media").sort((a, b) => b.area_pct - a.area_pct).slice(0, 12);
  const text = items.filter((i) => i.role === "text").sort((a, b) => (b.font.size * Math.sqrt(b.area_pct + 0.01)) - (a.font.size * Math.sqrt(a.area_pct + 0.01))).slice(0, 25);
  const boxes = items.filter((i) => i.role === "box").sort((a, b) => b.area_pct - a.area_pct).slice(0, 14);
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")))];
  const body = getComputedStyle(document.body);
  return {
    viewport: { w: vw, h: vh }, scrollY: Math.round(sy), docHeight: document.documentElement.scrollHeight,
    hScrollOverflow: document.documentElement.scrollWidth - vw,
    bodyBg: body.backgroundColor, fontsLoaded: fonts,
    canvases: document.querySelectorAll("canvas").length,
    elements: [...media, ...text, ...boxes],
  };
}

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--hide-scrollbars"] });
const summary = [];
for (const [w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
    reducedMotion: flag("reduced-motion") ? "reduce" : "no-preference", isMobile: w < 768, hasTouch: w < 768 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(async () => { await page.goto(url, { waitUntil: "load", timeout: 60000 }); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(wait);
  for (const s of scrolls) {
    // Walk the page in steps so scroll-triggered reveals fire, then settle at the target position.
    const target = await page.evaluate((f) => Math.round(f * (document.documentElement.scrollHeight - innerHeight)), s);
    for (let y = 0; y <= target; y += Math.max(200, Math.round(h * 0.6))) { await page.mouse.wheel(0, 0); await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(80); }
    await page.evaluate((yy) => scrollTo(0, yy), target);
    await page.waitForTimeout(wait);
    const label = `${w}x${h}${scrolls.length > 1 || s ? `@${Math.round(s * 100)}` : ""}`;
    await page.screenshot({ path: join(out, `${label}.png`), fullPage: flag("full") && s === 0 });
    const report = await page.evaluate(extract);
    report.url = url; report.errors = errors.slice(0, 10);
    writeFileSync(join(out, `${label}.json`), JSON.stringify(report, null, 1));
    summary.push({ label, elements: report.elements.length, docHeight: report.docHeight, fonts: report.fontsLoaded.slice(0, 6), errors: errors.length, overflow: report.hScrollOverflow });
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, "capture.summary.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
