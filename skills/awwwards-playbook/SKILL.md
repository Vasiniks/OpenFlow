---
name: awwwards-playbook
description: The acceptance bar, feature menu, code recipes and prompt templates for Awwwards Site-of-the-Day-level websites (Next.js + GSAP + Lenis + three.js/R3F). Use when building or recreating any premium, cinematic, motion-led or 3D website, when writing the brief/superprompt for one, or when judging whether a build is "award level". Pairs with visual-fidelity (teardown/measure), asset-forge (real assets) and build-awwwards-quality-sites / cinematic-gsap-lenis-motion-system.
---

# Awwwards playbook

"Award level" is an engineering target, not a vibe: **one art-directed idea, choreographed motion that carries meaning, real assets, 60 fps on a mid-range phone.** Everything below is measurable.

## 1. How the jury scores (and what loses points)

| Criterion | Weight | Rewarded | Penalised |
|---|---|---|---|
| Design | 40% | one concept carried everywhere, disciplined type scale, grid you can feel but not see, intentional crops | effects without a concept, competing visual ideas, template layouts |
| Usability | 30% | orientation < 3 s, 60 fps, great on phones, focus states, reduced-motion honoured | jank, desktop-only thinking, heavy first load, no reduced-motion |
| Creativity | 20% | an interaction that couldn't belong to another brand, executed further than expected | generic tropes: blob cursors, default Lenis-only "smoothness", boilerplate WebGL planes |
| Content | 10% | real copy, real photography/renders, words + images + motion pulling one way | lorem, stock clichés, fake testimonials/logos |

SOTD ≈ 8.0+/10 from ~18 jurors (outliers dropped). Design + Usability = 70%.

## 2. Definition of done (every item is checked with `vf teardown` on YOUR build + a trace)

| Gate | Measure | Pass |
|---|---|---|
| Intro | `intro/t*.jpg` of your build | a composed load sequence (preloader or curtain → staged hero entrance ≥3 beats), hero readable ≤ 1.8 s |
| Signature moment | teardown motion map | ≥1 pinned or scrubbed sequence per page (horizontal track, image sequence, 3D camera move, scrubbed text) |
| Choreography density | teardown `reveals` + `split_text` | every section has an authored entrance (split-line headings, clip/mask image reveals, staggered lists) |
| Hover system | teardown `hover.json` | every link/button/card has a designed hover (text roll, underline draw, image scale/clip, magnetic) |
| No empty viewports | contact sheet (`scroll-sheet-*.png`) | every screen carries content + a real asset; no dark/blank panels waiting for imagery |
| Real assets | teardown `assets.json` + source grep | hero uses a real photo/render/video/glTF; **0 illustrations drawn with CSS/SVG/divs**; every asset credited |
| 3D/shader (if used) | teardown `three.json` + a crop of the render | tone mapping ACES/AgX, HDRI environment applied to every material (metals show reflections, never flat white/black), PBR values; DPR ≤ 2; paused off-screen |
| Legibility | captures at 1440 + 390 | text over imagery/3D ≥ 4.5:1 contrast; no display text column narrower than ~18 characters |
| Transitions | teardown `transition` | route changes animate (View Transitions or GSAP overlay), not a hard cut |
| Performance | Chrome trace / Lighthouse mobile | 60 fps while scrolling, LCP < 2.5 s, CLS < 0.05, JS < ~350 KB gz per route |
| Access | keyboard + `prefers-reduced-motion` | focus visible; reduced motion = final states, no scrub/pin/smooth scroll |
| Copy | grep | no lorem/placeholder, no invented clients/testimonials |

## 3. Signature feature menu (pick ONE hero idea + 3–5 supporting features, all serving the concept)

| Feature | Mechanism | Recipe |
|---|---|---|
| Preloader → hero curtain | GSAP timeline: counter 0→100, clip-path curtain, SplitText lines up | R2 |
| Kinetic headline | SplitText `mask:"lines"`, yPercent 100→0, stagger .08, `expo.out` 1.1 s | R3 |
| Image clip reveal | `clip-path: inset(100% 0 0 0)` → `inset(0)` + inner img scale 1.25→1, scrub or once | R4 |
| Pinned horizontal track | ScrollTrigger pin + `x: -(track - viewport)` scrub 1 | R5 |
| Product image sequence | `forge sequence` → canvas frames scrubbed by ScrollTrigger (Apple-style) | R6 |
| WebGL hero object | R3F + drei `Environment` (HDRI) + forge `.glb` (glass/chrome) + scroll camera | R7 |
| Shader atmosphere | Paper Shaders (MeshGradient/GrainGradient/LiquidMetal) or the reference's own GLSL | asset-library |
| Hover text roll / magnetic CTA | duplicated split chars translateY -100% / quickTo pointer follow | R8 |
| Infinite marquee | GSAP `xPercent` loop, velocity-skewed by scroll | skill `marquee-loop` |
| Page transitions | React `<ViewTransition>` / `document.startViewTransition` or GSAP overlay | skill `vercel-react-view-transitions` |
| Custom cursor | only if it *informs* (label/scale over media); `gsap.quickTo`; `mix-blend-mode: difference` | R8 |

More recipes, each self-contained: skills `cinematic-gsap-lenis-motion-system`, `masked-reveal`, `staggered-word-reveal`, `scroll-scrubbed-word-reveal`, `scroll-scrubbed-visual-sequence`, `reveal-hover-effect`, `webgl-3d-object`, `build-threejs-scroll-worlds`, `shaders-cursor-ripples`, `atmosphere-background`; GSAP MCP `gsap_create_production_pattern`.

## 4. Recipes (Next.js App Router, pinned: gsap 3.15, @gsap/react 2.1, lenis 1.3, three 0.186, R3F 9.8, drei 10.7)

**R1 — smooth scroll + GSAP (one engine, one ticker)** `app/providers/smooth-scroll.tsx`
```tsx
"use client";
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: false, lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis.destroy(); };
  }, []);
  return <>{children}</>;
}
```

**R2 — preloader → hero** (render the hero complete without JS; animate *from* states only after mount)
```tsx
useGSAP(() => {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const split = SplitText.create(".hero-title", { type: "lines", mask: "lines" });
    const counter = { v: 0 };
    gsap.timeline({ defaults: { ease: "expo.out" } })
      .to(counter, { v: 100, duration: 1.4, ease: "power2.inOut", onUpdate: () => (countRef.current!.textContent = String(Math.round(counter.v))) })
      .to(".loader", { clipPath: "inset(0 0 100% 0)", duration: 1.0, ease: "power4.inOut" })
      .from(".hero-media", { scale: 1.25, duration: 1.6 }, "<")
      .from(split.lines, { yPercent: 105, duration: 1.1, stagger: 0.08 }, "<0.2")
      .from(".hero-meta > *", { y: 20, opacity: 0, duration: 0.8, stagger: 0.06 }, "<0.3");
    return () => split.revert();
  });
}, { scope: rootRef });
```

**R3 — split-line reveals on scroll** (headings in every section)
```tsx
useGSAP(() => {
  gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
    SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: (s) =>
      gsap.from(s.lines, { yPercent: 105, duration: 1.1, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: el, start: "top 85%" } }) });
  });
}, { scope: rootRef });
```

**R4 — clip-path image reveal**
```tsx
gsap.timeline({ scrollTrigger: { trigger: fig, start: "top 80%" } })
  .fromTo(fig, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "power4.inOut" })
  .from(fig.querySelector("img"), { scale: 1.25, duration: 1.6, ease: "expo.out" }, "<");
```

**R5 — pinned horizontal track**
```tsx
const dist = () => track.scrollWidth - innerWidth;
gsap.to(track, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: section, pin: true, scrub: 1, end: () => `+=${dist()}`, invalidateOnRefresh: true } });
```

**R6 — scroll-scrubbed image sequence** (frames from `forge sequence model.glb --frames 120 --out public/seq`)
```tsx
const meta = await (await fetch("/seq/sequence.json")).json();
const imgs = meta.files.map((f: string) => Object.assign(new Image(), { src: `/seq/${f}` }));
const ctx = canvas.getContext("2d")!, state = { f: 0 };
const draw = () => { const img = imgs[state.f]; if (img.complete) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); } };
imgs[0].onload = draw;
gsap.to(state, { f: meta.frames - 1, snap: "f", ease: "none", onUpdate: draw, scrollTrigger: { trigger: section, start: "top top", end: "+=250%", pin: true, scrub: 0.5 } });
```

**R7 — WebGL hero object** (real asset + real light; lazy, capped DPR, paused off-screen)
```tsx
"use client";
import { Canvas } from "@react-three/fiber";
import { Environment, useGLTF, MeshTransmissionMaterial, Float } from "@react-three/drei";
import * as THREE from "three";
function Hero() {
  const { nodes } = useGLTF("/models/glass-blob.glb") as any;
  const mesh = Object.values(nodes).find((n: any) => n.isMesh) as THREE.Mesh;
  return (<Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.6}>
    <mesh geometry={mesh.geometry}><MeshTransmissionMaterial thickness={0.6} roughness={0.05} ior={1.5} chromaticAberration={0.06} anisotropicBlur={0.2} /></mesh>
  </Float>);
}
export default function Scene() {
  return (<Canvas dpr={[1, 1.75]} frameloop="demand" gl={{ toneMapping: THREE.ACESFilmicToneMapping }} camera={{ fov: 30, position: [0, 0, 6] }}>
    <Environment files="/hdri/studio_small_09_2k.hdr" /><Hero />
  </Canvas>);
}
```
Load it with `next/dynamic(() => import("./scene"), { ssr: false })` and mount near the viewport. Drive the camera from ScrollTrigger progress stored in a ref (never setState per frame). For a RECREATE, use the reference's captured shaders (`teardown/shaders/custom-*`) and material values (`three.json`) instead.

**R8 — hover text roll + magnetic button**
```tsx
// text roll: two stacked copies inside overflow:hidden; on hover both move up 100%
.roll { display:inline-grid; overflow:hidden } .roll > span { grid-area:1/1; transition: transform .6s cubic-bezier(.76,0,.24,1) }
.roll > span:last-child { transform: translateY(100%) } .roll:hover > span:first-child { transform: translateY(-100%) } .roll:hover > span:last-child { transform: none }
// magnetic
const xTo = gsap.quickTo(btn, "x", { duration: 0.6, ease: "power3" }), yTo = gsap.quickTo(btn, "y", { duration: 0.6, ease: "power3" });
btn.addEventListener("pointermove", (e) => { const r = btn.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * 0.35); yTo((e.clientY - r.top - r.height / 2) * 0.35); });
btn.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
```

Validate every GSAP file with MCP `gsap_validate_gsap_code({ code, framework: "nextjs" })` before capture.

## 5. Prompt templates

**DESIGN (original, one-shot) — the brief the orchestrator writes before any specialist runs**
```
Build <site> for <audience>. Concept: <one sentence visual idea, e.g. "the product as a glass artefact under museum light">.
References (measured with vf teardown): <2–4 URLs + the one trait taken from each>.
Hero: <focal asset — forge render/sequence/glb or licensed photo>, intro sequence <beats>.
Sections (in order): <name — purpose — layout — signature motion — asset> × N (each has an authored entrance).
Signature moment: <one pinned/scrubbed sequence>. Motion character: <eases/durations family>. Type: <families + scale>.
Palette: <3–5 hex with roles>. Assets: <list with source/forge command>. Pages + transitions: <…>.
Done = playbook §2 gates. Never: CSS/SVG-drawn illustration, lorem, fake logos, two smooth-scroll engines.
```

**RECREATE — superprompt the reference-analyst writes from the teardown** (method: skill `video-to-superprompt`)
```
Recreate <url> exactly. Stack evidence: <runtime libs + bundle keywords>. Motion vocabulary: <eases/durations/ScrollTrigger configs from teardown>.
Intro: <beats with ms from intro/t*.jpg>. For each section: purpose · layout (vw/vh) · type · assets (downloaded files) · motion
(mechanism + values: pinned? scrub? reveal from→to, duration, ease) · hover · reduced motion.
3D: <renderer tone mapping/exposure, lights, materials, meshes/models, custom shaders to port>. Transitions: <frames>.
```

## 6. Never
Gradient blobs as "design"; glassmorphism everywhere; bento grids by default; Inter/system font as the display face without a reason; icons instead of imagery; SVG/CSS/div illustrations; stock-photo clichés; decorative WebGL planes; cursor blobs with no function; motion that doesn't explain or reveal; claiming "award-winning".
