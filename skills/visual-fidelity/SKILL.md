---
name: visual-fidelity
description: Measured reverse-engineering and render→compare→critique loop for frontend work. `vf teardown` crawls a site with Playwright and extracts its intro, scroll motion map, hover/cursor behaviour, page transitions, library stack, GSAP/ScrollTrigger values from its JS, live three.js scene (lights/materials/tone mapping), compiled GLSL shaders and real asset files; `vf capture/compare/track` measure layout fidelity at fixed viewports with pixel diffs and element deltas. Use when recreating or taking inspiration from a reference site, judging whether a UI matches a design, or before declaring any visual work done.
---

# Visual fidelity

A visual claim is only valid if it points at a render. This skill turns "looks off" into numbers.

## Tool

`VF=~/.agents/skills/visual-fidelity/scripts/vf` (installs its pinned deps on first run and uses the cached Playwright Chromium).

It renders WebGL on the **GPU** (full Chromium with Metal on macOS or D3D11 on Windows) and falls back to software rendering (SwiftShader) only when no GPU channel launches. The difference matters: on otsuka-air.jp a scroll step took ~10 s with software GL and 0.4 s on the GPU. `teardown.md` states which one was used.

```bash
$VF capture <url> --out .design/ref   --viewports 1440x900,390x844 [--scroll 0,0.5] [--wait 2500]
$VF capture http://localhost:3000/x --out .design/cur/iter-N --viewports <same> [--scroll <same>]
$VF compare .design/ref .design/cur/iter-N --out .design/cur/iter-N/compare
```

- `capture` writes `<W>x<H>[@scroll%].png` plus a `.json` layout report. The report lists salient media/text/boxes with their box in px **and** vw/vh, font family/size/weight/letter-spacing/color, backgrounds, SVG fill, radius, and position. It also records page background, loaded fonts, canvas count, overflow, and console errors.
- `compare` writes `compare.md`: pixel mismatch %, the top-5 hotspot cells (e.g. `upper-right 38%`), an element-delta table (Δx vw, Δy vh, w×, h×, font ratio, family/weight/color changes, sorted by *impact*), **omissions** (in ref, missing in current) and **extras** (in current, unmatched in ref). It also writes `*.side-by-side.png` and `*.diff.png`.
- **Screenshot-only reference:** put the PNGs in `.design/ref/` named `1440x900.png` etc. and capture the build at the same sizes. Pixel analysis still works. Element deltas need a URL reference; without one, read coordinates off the side-by-side.

## Teardown: reverse-engineer a site (run it FIRST on any reference; run it on your own build before calling it done)

```bash
$VF teardown <url> --out .design/ref/teardown --pages 20     # whole site; finishes within --budget (default 600 s)
```
- **Coverage.** The motion map scales its steps with the page (up to 80, spread over the full length), so pins at 40 screens are measured too.
- **Assets.** Anything the page loaded but the browser couldn't hand over (streamed video, large glb) is downloaded directly at the end. Agents don't need curl for reference files.
- **Time budget.** Each phase gets a share of `--budget` and is cut short when that share is spent. Results are written after every phase, and a watchdog writes whatever exists 60 s past the budget.
- **When a phase was cut,** the header says **PARTIAL** and names what's missing. Re-run with a bigger `--budget` or fewer `--pages`, into another folder.
- **Shell timeout.** Give the command a shell timeout of at least `budget + 120 s`.
- **No `timeout` on macOS.** macOS has no `timeout` command.
Read `teardown.md` first, then LOOK at the evidence it lists. It records:
- **Intro:** frames at 0.3–7 s plus `intro.webm`; when the intro finished.
- **Scroll:** contact sheets of one continuous human-speed scroll (`scroll-sheet-*.png`, 20 frames per sheet), plus a screenshot per half-screen.
- **Motion map:** every element that is **scroll-linked** (translate/scale/opacity/clip ranges), **revealed once** (from→to with fitted duration and ease), or **pinned**; split-text blocks. Virtual scrollers (transform-based) and non-scrolling layouts are handled.
- **Motion vocabulary from the site's own JS:** GSAP eases, durations, staggers, ScrollTrigger `start`/`end`/`scrub` values and snippets, CSS cubic-beziers, smooth-scroll options.
- **Stack:** GSAP, ScrollTrigger pins, Lenis, Locomotive, Barba, Swup, three.js version, Pixi, Spline, Lottie, Rive, Webflow, Framer, howler; canvases and their context type.
- **three.js scene** (live, via three's devtools hook): renderer tone mapping and exposure, lights (type, colour, intensity, position), materials (PBR values, maps, transmission, custom-shader uniforms), meshes and vertex counts, fog, environment.
- **Every GLSL program the page compiled:** `shaders/custom-*` are the site's own shaders. Port them; don't approximate the look.
- **Hover diffs** per link/button/card, summarised (e.g. "7× child div y0 → y-31 = text roll"), plus custom-cursor detection.
- **Menu/tab states and a page transition,** each as a frame sequence.
- **Other routes** (screenshots per step) and the **real assets:** fonts, glb/gltf/ktx2/hdr, Lottie JSON, Rive, the largest images.
  - **`assets.json` maps every saved file to its source URL.**
  - **`fonts.json` / `fonts.css`** map each font family to its saved file. They capture `@font-face` rules added at runtime too (FontPlus/Adobe Fonts inject them via `insertRule`/`FontFace` with extensionless glyph-subset URLs). Font files get their extension from their magic bytes.
  - **File names** keep the last two URL segments (`image-takashidoi01-hero-top-1f36699d.webp`), so each photo can be put where the reference uses it.

- **Pointer probe:** the regions that react when the mouse moves (ambient animation excluded), and the elements that move with the mouse (parallax, magnetic).
- **Up to 3 page transitions** filmed there and back.
- **A breadth-first crawl of the whole site** (`--pages 12` by default; use 20 for recreations).
- **`progress/p###.png`:** frames indexed by scroll progress.

### Feel parity: `vf feel <refTeardown> <buildTeardown> --out DIR`
Compares two teardowns mechanism by mechanism. It writes `feel.md`:
- a table covering smooth scroll, GSAP-animated elements, intro timing, split text, reveals, scroll-linked, pins, easing vocabulary, durations, hover kinds, cursor, pointer reactivity, transitions, WebGL, lights, materials, custom shaders, fonts, images/video/models, and pages;
- a **parity %**.

It also writes **side-by-side sheets** (reference LEFT, build RIGHT): `feel-intro.png` (same ms after load), `feel-scroll-NN.png` (same scroll progress), `feel-transition.png` and `feel-states.png`.

Pixel similarity can't see motion; this can. An old recreation that scored about 99% on pixels scored 33% here, because the WebGL, pins, transitions, pages and imagery were all missing.

A teardown turns "it has some animation" into "12 split-line reveals at 1100 ms expo.out, 1 pinned horizontal track, ScrollTrigger `start:'top top' end:'bottom-=500px bottom' scrub:true`". Specs and critiques must quote it.

## Protocol

1. **Same conditions every time.** Use the same viewports, scroll fractions and `--wait`. Run a production build (`next build && next start`) or a stable dev server. Nothing counts from a stale build.
2. **Viewports.** Pick from 1920×1080, 1440×900, 1024×768, 768×1024, 430×932, 390×844, matching what the reference exists at. Converge on the primary desktop size first; then add mobile; then the intermediate sizes.
3. **Look at the images, not just the numbers.** Read `side-by-side.png` for every label you critique. Numbers localise; eyes judge.
4. **Scroll-driven sites.** Capture at the scroll fractions where sections settle (e.g. `0,0.15,0.35`). Don't use full-page shots of pinned pages: pin-spacers distort them.
5. **Regression guard.** After every compare, run `$VF track .design/cur`. It ranks iterations by pixel mismatch (element impact breaks ties), marks the BEST, and exits 3 when the latest iteration regressed. On a regression, attribute it with `$VF compare .design/cur/<best> .design/cur/<latest>`: this build-vs-build diff shows exactly what your last change moved. Then revert or redo that change. Never stop on an iteration that isn't the best, and never blame animation noise for a regression without that diff proving the canvas changed.
6. **Loop budget.** It's owned by the orchestrator (STEP 7: up to 8 rounds). Exit on inventory done + feel parity ≥ 90% + 0 P0, not on pixel plateaus. Pixel mismatch is a secondary trend line.
7. **Fix causes, not metrics.** Never make a wrong asset "fit" with tracking, scaling or transforms. If same-size text is wider or narrower than the reference, the font *file* is wrong (a different cut, version or width). Fetch the reference's actual file, whose URL is in reference-spec, via network requests. Letter-spacing deltas on matched text are scored as defects for this reason.
8. **Evidence format** (every issue): `OBSERVATION` (a number from compare.md or a coordinate on the side-by-side) → `INTERPRETATION` (why it matters visually) → `RECOMMENDATION` (a concrete change: property, value, element).

## Reading the numbers

- Omissions and large misplacements (`|Δ| > 3vw/vh` on elements with area > 2%) come first; they dominate perceived fidelity.
- Next come typography family/size/weight and background/major color. `font_ratio` off by more than 10% on display text is always visible.
- Pixel mismatch % is a trend line, not a target. Animated canvases, video and particles make it noisy, so judge those regions visually.
- An **Extra** is not automatically wrong. It is wrong only if nothing in the reference or the design spec justifies it.
