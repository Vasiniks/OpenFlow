---
description: One-shot an original, Awwwards-level website from a brief (concept → references → real assets → choreography → build → gated loop)
agent: frontend
---
Design and build an original website at Awwwards Site-of-the-Day level. Mode: DESIGN.

Brief: $ARGUMENTS

Defaults unless the brief says otherwise:
- **Size:** one landing page with 5–7 sections plus one secondary page.
- **Stack:** Next.js with GSAP, Lenis and R3F from the kit.
- **Route:** `src/app/<slug>/`. **Viewports:** 1440x900 and 390x844.

Pipeline (do not skip steps):
1. **Brief.** Write `.design/brief.md` with the DESIGN template from skill `awwwards-playbook` §5.
2. **Art direction.** `art-director` produces ONE concept and grounds it in 2–4 real award references, found and measured with `vf teardown --no-assets --pages 0`. It then picks the hero idea and 3–5 signature features from the playbook menu, and writes the asset plan.
3. **Assets.** `asset-producer` makes every asset in the plan: Blender renders, sequences and procedural glTF, CC0 photography, HDRIs. Nothing is drawn with CSS or SVG.
4. **Motion and 3D.** `motion-designer` writes the full choreography (intro, per-section entrances, signature scrub/pin, hover system, page transition). `threejs-art-director` specs the WebGL hero if the concept uses 3D. `interaction-designer` handles the navigation and menu.
5. **Build.** Implement section by section with the playbook recipes. Validate every GSAP file with the gsap MCP.
6. **Loop.** Run the measured loop against the art-direction spec and the playbook §2 definition-of-done gates. Check them with `vf teardown` of the build. Then do responsive work.

Finish with the gate table (pass/fail with evidence) and the asset credits.
