---
description: Recreate a reference website — every section, its motion, 3D, assets and pages — with teardown evidence and the measured loop
agent: frontend
---
Recreate this reference in the current project. Mode: RECREATE.

Reference: $ARGUMENTS

Defaults unless the arguments say otherwise:
- **Scope:** the WHOLE home page (every section, top to bottom) plus up to 3 internal pages from the reference's main navigation.
- **Route:** `src/app/recreate/<slug>/`. **Viewports:** 1440x900 and 390x844.

Pipeline (do not skip steps):
1. **Brief.** Write `.design/brief.md` from my words only.
2. **Teardown.** Run `vf teardown` into `.design/ref/teardown` BEFORE any specialist runs.
3. **Superprompt.** Have `reference-analyst` explore the reference with Playwright (every nav item, tab, toggle, hover, menu, scroll section, page transition) and write the superprompt spec.
4. **Specialists.** Run motion-designer, then threejs-art-director if the teardown shows WebGL, then asset-producer for any asset the teardown couldn't download.
5. **Build.** Implement section by section, using the reference's own fonts, assets, eases/durations and ported shaders.
6. **Loop.** Run the measured loop, which checks motion parity (`vf teardown` of the build vs the reference) as well as pixels. Then do responsive work.

Finish with the metrics table and the motion-parity table.
