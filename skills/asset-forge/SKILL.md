---
name: asset-forge
description: Produce REAL visual assets for a website instead of drawing them with CSS/SVG — CC0 photography, Poly Haven HDRIs/models/textures, headless-Blender studio renders, turntable/scroll-scrub image sequences, procedural hero objects (glass, chrome, liquid metal, crystal, silk) exported as optimised glTF, and AI images when a key exists. Use whenever a page needs a hero image, product shot, 3D object, texture, background plate, image sequence or any illustration.
---

# Asset forge

**Rule zero: never draw an asset with CSS, SVG paths, canvas 2D or divs.** Gradients-as-art, CSS "3D", div illustrations and hand-written SVG scenes are what make AI sites look like AI sites. Allowed authored vectors: logos/wordmarks, UI icons (Iconify/Lucide), data graphics.

`F=~/.agents/skills/asset-forge/scripts/forge` (Windows: `forge.cmd`). Every command prints credits; append them to `ATTRIBUTION.md`.

## Decide the source (in this order)

| Need | 1st choice | Command |
|---|---|---|
| Reference's own asset (RECREATE) | the file `vf teardown` downloaded | copy from `.design/ref/teardown/assets/` (check its license before shipping publicly) |
| Photography (people, places, texture) | CC0 photos (Openverse; Unsplash with `UNSPLASH_ACCESS_KEY`) | `$F photos "brutalist concrete stair" --out public/img --n 6` |
| Environment light / reflections | Poly Haven HDRI | `$F search hdris studio` → `$F hdri studio_small_09 --out public/hdri` |
| Real-world object | Poly Haven model (CC0) → optimised glb | `$F search models chair` → `$F model ArmChair_01 --out public/models` |
| Hero object with a material story | procedural Blender object | `$F procedural glass-blob --out public/models --light hero --color "#dfe8ff"` (also `chrome-knot`, `liquid-metal`, `crystal-cluster`, `silk-ribbon`) |
| Product shot / plate from a model | headless Blender studio render | `$F render public/models/x.glb --out public/img --light dark --size 2400x1350 --dof` |
| Apple-style scroll-scrubbed object | turntable / dolly / crane frames | `$F sequence public/models/x.glb --out public/seq --frames 120 --path orbit --size 1600x1000` |
| Transparent cut-out of an object | render with alpha | add `--transparent` |
| Illustration / painterly plate / texture | AI image (needs `OPENAI_API_KEY` or `FAL_KEY`) | `$F image "<prompt>" --out public/img/plate.png --size 1536x1024` |
| Any other 3D model | Sketchfab CC0/CC-BY, Poly Pizza (via Blender MCP when Blender is open) or Hyper3D/Hunyuan AI 3D | `blender_search_sketchfab_models` → `blender_download_sketchfab_model` → `blender_export_scene` → `$F optimize` |

Without an image-API key, `forge image` falls back to Pollinations (≈1024 px, watermark). Use it for **moodboards only**; ship photography or Blender renders instead.

## Lighting presets (`--light`)
- `studio`: neutral HDRI plus a soft key and rim.
- `dark`: near-black cove with split cold/warm rims; very editorial.
- `hero`: warm key, cool rim, kick light.
- `warm`: paper-white cove with soft daylight.

Every preset uses a real HDRI (default Poly Haven `studio_small_09`, override with `--hdri <id|file>`), AgX tone mapping and a seamless infinity cove, so there's no horizon line. `--bg "#hex"` sets the cove and backdrop colour, so match it to the page background and the render sits *in* the page.

## Web delivery
- **glTF:** `forge` already runs `gltf-transform optimize` (meshopt + WebP). Keep 3D ≤ 4 MB per page and < 150k triangles on mobile.
- **Images:** 2× the display size. Use WebP/AVIF through `next/image` with `sizes`. Give heroes `priority`.
- **Sequences:** 60–150 frames and ≤ 1600 px wide. Preload the first 10, then lazy-load the rest. Draw them to a `<canvas>` (see awwwards-playbook R6).
- **Credits:** record every file (source, license, command) in `ATTRIBUTION.md`.

## Quality checks (look at every output before using it)
- The subject fills 40–70% of the frame, sits on the brand palette, and has no clipped highlights or horizon lines.
- Glass and chrome need an HDRI. A black reflection means the environment is missing.
- If it looks like a generic 3D render, change the angle (`--angle 8` low heroic, `--angle 40` product top-down), the lens (`--lens 50|85|135`), `--dof`, or the light preset. Then re-render.
