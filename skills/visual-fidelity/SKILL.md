---
name: visual-fidelity
description: Measured render→compare→critique loop for frontend work. Captures a reference and the current build at fixed viewports, extracts element geometry/typography in vw/vh units, and produces pixel-diff hotspots, element deltas, omissions and unjustified extras. Use when recreating a reference site/screenshot, judging whether a UI matches a design, or before declaring any visual work done. Never judge visual quality without running this.
---

# Visual fidelity

A visual claim is only valid if it points at a render. This skill turns "looks off" into numbers.

## Tool

`VF=~/.agents/skills/visual-fidelity/scripts/vf` (installs its 3 pinned deps on first run and uses the cached Playwright Chromium).

```bash
$VF capture <url> --out .design/ref   --viewports 1440x900,390x844 [--scroll 0,0.5] [--wait 2500]
$VF capture http://localhost:3000/x --out .design/cur/iter-N --viewports <same> [--scroll <same>]
$VF compare .design/ref .design/cur/iter-N --out .design/cur/iter-N/compare
```

- `capture` writes `<W>x<H>[@scroll%].png` plus a `.json` layout report. The report lists salient media/text/boxes with their box in px **and** vw/vh, font family/size/weight/letter-spacing/color, backgrounds, SVG fill, radius, and position. It also records page background, loaded fonts, canvas count, overflow, and console errors.
- `compare` writes `compare.md`: pixel mismatch %, the top-5 hotspot cells (e.g. `upper-right 38%`), an element-delta table (Δx vw, Δy vh, w×, h×, font ratio, family/weight/color changes, sorted by *impact*), **omissions** (in ref, missing in current) and **extras** (in current, unmatched in ref). It also writes `*.side-by-side.png` and `*.diff.png`.
- **Screenshot-only reference:** put the PNGs in `.design/ref/` named `1440x900.png` etc. and capture the build at the same sizes. Pixel analysis still works. Element deltas need a URL reference; without one, read coordinates off the side-by-side.

## Protocol

1. **Same conditions every time.** Use the same viewports, scroll fractions and `--wait`. Run a production build (`next build && next start`) or a stable dev server. Nothing counts from a stale build.
2. **Viewports.** Pick from 1920×1080, 1440×900, 1024×768, 768×1024, 430×932, 390×844, matching what the reference exists at. Converge on the primary desktop size first; then add mobile; then the intermediate sizes.
3. **Look at the images, not just the numbers.** Read `side-by-side.png` for every label you critique. Numbers localise; eyes judge.
4. **Scroll-driven sites.** Capture at the scroll fractions where sections settle (e.g. `0,0.15,0.35`). Don't use full-page shots of pinned pages: pin-spacers distort them.
5. **Regression guard.** After every compare, run `$VF track .design/cur`. It ranks iterations by pixel mismatch (element impact breaks ties), marks the BEST, and exits 3 when the latest iteration regressed. On a regression, attribute it with `$VF compare .design/cur/<best> .design/cur/<latest>`: this build-vs-build diff shows exactly what your last change moved. Then revert or redo that change. Never stop on an iteration that isn't the best, and never blame animation noise for a regression without that diff proving the canvas changed.
6. **Loop budget.** A maximum of 3 critique→fix iterations per viewport set. Stop early when pixel mismatch and the top-3 impact scores stop improving (<10% relative change), and report what remains.
7. **Fix causes, not metrics.** Never make a wrong asset "fit" with tracking, scaling or transforms. If same-size text is wider or narrower than the reference, the font *file* is wrong (a different cut, version or width). Fetch the reference's actual file, whose URL is in reference-spec, via network requests. Letter-spacing deltas on matched text are scored as defects for this reason.
8. **Evidence format** (every issue): `OBSERVATION` (a number from compare.md or a coordinate on the side-by-side) → `INTERPRETATION` (why it matters visually) → `RECOMMENDATION` (a concrete change: property, value, element).

## Reading the numbers

- Omissions and large misplacements (`|Δ| > 3vw/vh` on elements with area > 2%) come first; they dominate perceived fidelity.
- Next come typography family/size/weight and background/major color. `font_ratio` off by more than 10% on display text is always visible.
- Pixel mismatch % is a trend line, not a target. Animated canvases, video and particles make it noisy, so judge those regions visually.
- An **Extra** is not automatically wrong. It is wrong only if nothing in the reference or the design spec justifies it.
