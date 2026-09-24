---
name: asset-library
description: Curated, license-checked sources for frontend visual assets and effect libraries — 3D models, HDRIs, PBR materials, rigs, photos, icons, fonts, plus the scroll/animation/shader/orb/transition libraries that fit award-style sites. Use when choosing where an asset or effect should come from, when a design calls for imagery/3D/type/background effects, or when checking an asset's license. Consult before inventing placeholder visuals.
---

# Asset library

Two layers: **content sources** (where pixels and meshes come from) and **effect libraries** (what renders motion and atmosphere). Choose from here before inventing anything. A real asset beats a generated gradient.

## Content sources, the baseline 8 (all license-verified 2026-09-23)

| Need | Source | License | Agent access |
|---|---|---|---|
| HDRIs, PBR textures, photoreal models | **Poly Haven** | CC0, no credit | `api.polyhaven.com` (send a User-Agent); Blender MCP `download_polyhaven_asset` |
| Any other 3D model | **Sketchfab**, filtered `license=cc0` (or CC-BY with credit) | per model | Keyless search `api.sketchfab.com/v3/search?type=models&downloadable=true&license=cc0&q=…`; download via Blender MCP (token) |
| Icons: UI, brand, niche | **Iconify** (Lucide, Phosphor, Tabler, Material, Simple Icons…) | per set | `api.iconify.design/search?query=…` |
| PBR materials at scale | **ambientCG** | CC0 | `ambientcg.com/api/v2/full_json?q=…` |
| Distinctive type | **Fontshare** (Satoshi, General Sans, Cabinet Grotesk, Clash, Switzer) | ITF Free Font License / OFL | `api.fontshare.com/v2/fonts`, self-host woff2 |
| Cohesive stylised kits (3D/2D/UI/SFX) | **Kenney** | CC0 | manual packs |
| Photos with machine-readable licenses | **Openverse** (quality runner-up: Unsplash, needs API key) | per item | `api.openverse.org/v1/images/?q=…&license=cc0` |
| Rigging + character animation | **Mixamo** | royalty-free; no raw redistribution | manual (Adobe ID) → FBX → Blender → glTF |

Breadth fallbacks: Google Fonts/Fontsource (type), The Met / Art Institute of Chicago (CC0 art, keyless APIs), Freesound CC0 (audio), Quaternius (rigged low-poly).

## Effect libraries (from the special-assets research, scored /10)

| Role | Default | Use when | Avoid |
|---|---|---|---|
| Smooth scroll | **Lenis** 9.5 | any scroll-choreographed site; one driver synced to the GSAP ticker | ScrollSmoother + Lenis together; Locomotive (it's just Lenis) |
| Timelines, scroll, text | **GSAP** + ScrollTrigger / SplitText / Flip 10 | pinned or scrubbed scenes, masked text reveals, layout morphs | — |
| React component motion | **Motion** 9 | springs, layout, enter/exit in React | long scroll timelines (use GSAP) |
| Page transitions | **View Transitions API** 8.5 | route morphs; zero KB | Barba on new projects |
| 3D | **three.js / R3F + drei** 9 | only when 3D *is* the product moment; one per page | decorative floating primitives |
| Shader backgrounds | **Paper Shaders** 9 | mesh gradient, grain, liquid metal, fluted glass, dithering, halftone | Vanta (dated, heavy); Stripe whatamesh (reads as a Stripe copy) |
| No-code WebGL hero | Unicorn Studio 8.5 | fastest route to a signature hero effect; check pricing | — |
| Orbs, auroras, text FX | **React Bits** 8.5 | take single pieces (Orb, Silk, BlurText, SplitText); license is MIT + Commons Clause | the whole kit |
| Marketing micro-components | Magic UI 7.5 | marquee, globe, number tickers | — |
| Globe | **cobe** 8.5 | 5 KB, markers/arcs | — |
| Interactive vector animation | Rive 8 (state machines) / Lottie 7 (playback only) | mascots, stateful icons | — |
| Minimal WebGL | OGL 8 | tiny orb/shader effects | — |
| Particles | tsParticles 7.5 | confetti-type moments only | particles.js (abandoned) |
| Cursor/magnetic | ~20 lines of GSAP/Motion | informative cursors only | libraries |

**Skip:** Vanta, particles.js, Aceternity beams/spotlights (they read as template/AI-made), more than one Spline scene per page.

## Rules

- **Recreation:** match the reference's actual asset types first: its fonts (from the `visual-fidelity` report), its media kind (video vs canvas vs SVG), its effect. Substitute only when the original is unavailable, and then name the closest source above.
- **License:** CC0 first. Record every external file in `ATTRIBUTION.md` (source URL, license, processing). Self-host; don't hot-link.
- **3D delivery:** `gltf-transform optimize --texture-compress webp`; KTX2 dimensions in multiples of four; ≤4 MB of 3D; <150k triangles on mobile.
- **Budget:** at most one signature effect per viewport (one 3D moment *or* one shader hero *or* one orb). Stacking them is the AI-slop tell.
