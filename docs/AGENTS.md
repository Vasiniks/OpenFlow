# OpenCode frontend fleet: agents report

Generated from `agents/opencode/` (11 agents).

## Overview

| Agent | Mode | Edits code | Can consult | Shell | MCPs enabled | Prompt size |
|---|---|---|---|---|---|---|
| **frontend** | primary | `.design/**` only (code goes through builder) | reference-analyst, art-director, frontend-architect, interaction-designer, motion-designer, threejs-art-director, responsive-specialist, visual-critic, asset-producer, builder, explore | full | chrome-devtools, context7, serena, motion, shadcn, gsap | 13,968 chars |
| **reference-analyst** | subagent | no | — (leaf) | *visual-fidelity/scripts/vf capture*, *visual-fidelity/scripts/vf teardown*, ls * | playwright, chrome-devtools, headroom | 5,687 chars |
| **art-director** | subagent | no | threejs-art-director, motion-designer, reference-analyst | python3 *ui-ux-pro-max/scripts/search.py*, *visual-fidelity/scripts/vf teardown*, *asset-forge/scripts/forge search*, *asset-forge/scripts/forge image* | playwright, blender | 9,206 chars |
| **frontend-architect** | subagent | no | explore | ls *, cat package.json, cat components.json | chrome-devtools, context7, github, serena, shadcn, gsap | 6,046 chars |
| **interaction-designer** | subagent | no | motion-designer, reference-analyst | none | playwright | 4,635 chars |
| **motion-designer** | subagent | no | reference-analyst | none | playwright, chrome-devtools, context7, motion, gsap | 9,221 chars |
| **threejs-art-director** | subagent | no | reference-analyst | none | context7, github, blender | 6,794 chars |
| **responsive-specialist** | subagent | no | visual-critic, reference-analyst | *visual-fidelity/scripts/vf *, ls * | playwright, chrome-devtools | 5,033 chars |
| **visual-critic** | subagent | no | reference-analyst | *visual-fidelity/scripts/vf *, ls * | playwright, chrome-devtools | 7,393 chars |
| **asset-producer** | subagent | yes | — (leaf) | *asset-forge/scripts/forge *, *visual-fidelity/scripts/vf capture*, ls *, mkdir -p *, cp *, cp ~/.agents/skills/asset-forge/scripts/templates/* | blender | 4,725 chars |
| **builder** | subagent | yes | — (leaf) |  | chrome-devtools, context7, serena, motion, shadcn, gsap | 5,281 chars |

## Per agent

### frontend

Frontend design & recreation orchestrator. Runs specialist analysis → implementation → measured render → critique → fix loops until the build converges on the reference or design spec. Use for any high-end frontend build, redesign, or reference recreation.

- **Mode / temperature:** primary / 0.3
- **Edits code:** no (`.design/**` only; every source change goes through builder) · **Shell:** full
- **MCPs:** on: chrome-devtools, context7, serena, motion, shadcn, gsap; off: —
- **Skills loaded via `skill({ name })` (22):** asset-library, awwwards-playbook, baseline-ui, cinematic-gsap-lenis-motion-system, fixing-accessibility, fixing-metadata, fixing-motion-performance, frontend-ui-engineering, gsap-plugins, gsap-react, gsap-scrolltrigger, gsap-timeline, motion, shadcn, shader-dev, tailwind-design-system, threejs-scenes, vercel-composition-patterns, vercel-react-best-practices, web-perf, webapp-testing, webgl-3d-object
- **MCP tools called by exact name (12):** `chrome-devtools_list_console_messages`, `chrome-devtools_list_network_requests`, `chrome-devtools_new_page`, `context7_query-docs`, `context7_resolve-library-id`, `gsap_create_production_pattern`, `gsap_generate_complete_setup`, `gsap_validate_gsap_code`, `motion_search-motion-docs`, `serena_find_symbol`, `shadcn_get_add_command_for_items`, `shadcn_search_items_in_registries`
- **Asset libraries / effect libs (11):** Poly Haven, GSAP, Motion, View Transitions, React Bits, Magic UI, cobe, R3F, drei, postprocessing, shadcn

### reference-analyst

Reverse-engineers a reference website — every page, section, animation, hover, transition, 3D scene, shader and asset — with the teardown tool and hands-on Playwright exploration, then writes a build-ready superprompt spec. Read-only. Use at the start of any recreation, or to measure what a reference does.

- **Mode / temperature:** subagent / 0.2
- **Edits code:** no · **Shell:** *visual-fidelity/scripts/vf capture*, *visual-fidelity/scripts/vf teardown*, ls *
- **MCPs:** on: playwright, chrome-devtools, headroom; off: blender, github, serena, context7, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (3):** animation-vocabulary, video-to-superprompt, visual-fidelity
- **MCP tools called by exact name (13):** `chrome-devtools_evaluate_script`, `chrome-devtools_get_css_styles`, `chrome-devtools_list_network_requests`, `chrome-devtools_new_page`, `chrome-devtools_take_snapshot`, `headroom_headroom_compress`, `playwright_browser_click`, `playwright_browser_evaluate`, `playwright_browser_hover`, `playwright_browser_navigate`, `playwright_browser_press_key`, `playwright_browser_snapshot`, `playwright_browser_take_screenshot`
- **Asset libraries / effect libs (1):** Motion
- **Output contract:** 0. One-paragraph summary · 1. Stack evidence       runtime libs · bundle keywords · smooth scroll engine + options · page-transition system · 2. Motion vocabulary    eases · 3. Intro sequence       beat-by-beat with ms · 4. Sections             for EACH section, top to bottom: · 5. Global interactions  nav · 6. Page transitions     frames + mechanism · 7. 3D / WebGL           renderer · 8. Typography           families + weights + the exact font FILES · 9. Colour & material    palette · 10. Assets manifest     every file: kind · where used · saved path · license note; what still needs producing · 11. Other pages         per page: sections + anything that differs from home · 12. Responsive          what changes at 390 px · 13. Uncertain           what you could not measure and how to verify

### art-director

Sets concrete visual direction — thesis, typography, color/material, composition, imagery, motion and 3D principles, and a project-specific avoid list. Thinks and specifies; never edits code. Use at the start of design/redesign work, or in recreation when assets/fonts must be substituted.

- **Mode / temperature:** subagent / 0.5
- **Edits code:** no · **Shell:** python3 *ui-ux-pro-max/scripts/search.py*, *visual-fidelity/scripts/vf teardown*, *asset-forge/scripts/forge search*, *asset-forge/scripts/forge image*
- **MCPs:** on: playwright, blender; off: chrome-devtools, github, serena, headroom, context7, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (15):** asset-forge, asset-library, awwwards-playbook, brandkit, build-awwwards-quality-sites, design-first-ui-prompting, design-taste-frontend, frontend-design, generate-reference-inspired-brand-worlds, high-end-visual-design, impeccable, industrial-brutalist-ui, minimalist-ui, no-ai-design-slop, redesign-existing-projects
- **MCP tools called by exact name (7):** `blender_get_polyhaven_asset_preview`, `blender_get_sketchfab_model_preview`, `blender_search_polyhaven_assets`, `blender_search_sketchfab_models`, `playwright_browser_navigate`, `playwright_browser_snapshot`, `playwright_browser_take_screenshot`
- **Asset libraries / effect libs (6):** Poly Haven, Motion, Unicorn Studio, React Bits, cobe, shadcn
- **Output contract:** Concept · References · Visual thesis · Signature features · Section plan · Asset plan · Design language · Typography · Color/material · Composition · Imagery/assets · Signature effect · Motion principles · 3D principles · Avoid · Implementation priorities

### frontend-architect

Decides how the frontend is technically constructed — framework choice/fit, routes, component boundaries, server/client split, state and data flow, styling/token system, asset and loading strategy, performance budget, accessibility architecture, where motion/3D live in the tree. Produces an architecture spec; does not edit code. Use for new projects or structural changes, not every iteration.

- **Mode / temperature:** subagent / 0.2
- **Edits code:** no · **Shell:** ls *, cat package.json, cat components.json
- **MCPs:** on: chrome-devtools, context7, github, serena, shadcn, gsap; off: playwright, blender, headroom, motion
- **Skills loaded via `skill({ name })` (10):** frontend-ui-engineering, performance-optimization, pick-ui-library, shadcn, tailwind-design-system, threejs-scenes, vercel-composition-patterns, vercel-react-best-practices, vercel-react-view-transitions, web-perf
- **MCP tools called by exact name (16):** `chrome-devtools_lighthouse_audit`, `chrome-devtools_new_page`, `chrome-devtools_performance_analyze_insight`, `chrome-devtools_performance_start_trace`, `context7_query-docs`, `context7_resolve-library-id`, `github_search_code`, `gsap_generate_complete_setup`, `serena_find_referencing_symbols`, `serena_find_symbol`, `serena_get_symbols_overview`, `serena_search_for_pattern`, `shadcn_get_add_command_for_items`, `shadcn_get_project_registries`, `shadcn_search_items_in_registries`, `shadcn_view_items_in_registries`
- **Asset libraries / effect libs (7):** Lenis, GSAP, Motion, cobe, drei, postprocessing, shadcn
- **Output contract:** Stack decision · Route & file plan · Component boundaries · Tokens · State & data · Motion/3D placement · Loading & perf · Accessibility · Build order · Risks

### interaction-designer

Decides WHAT happens — navigation model, hover/focus/cursor behavior, scroll behavior, progressive disclosure, section transitions, feedback and affordances, keyboard/touch equivalents. Does not choose animation implementation (that is motion-designer). Read-only.

- **Mode / temperature:** subagent / 0.4
- **Edits code:** no · **Shell:** none
- **MCPs:** on: playwright; off: chrome-devtools, blender, github, serena, headroom, context7, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (8):** animation-vocabulary, apple-design, ask-sonner, emil-design-eng, find-animation-opportunities, fixing-accessibility, pick-ui-library, vercel-react-view-transitions
- **MCP tools called by exact name (7):** `playwright_browser_click`, `playwright_browser_hover`, `playwright_browser_navigate`, `playwright_browser_press_key`, `playwright_browser_resize`, `playwright_browser_snapshot`, `playwright_browser_take_screenshot`
- **Asset libraries / effect libs (7):** Iconify, GSAP, Motion, View Transitions, Rive, shadcn, Base UI
- **Output contract:** Interaction model · Navigation · Element behaviors · Cursor · Scroll behavior · Disclosure & transitions · States · Reduced motion & a11y · Avoid

### motion-designer

Decides HOW things move — GSAP timelines, ScrollTrigger pin/scrub, Lenis, easing, durations, sequencing, stagger, parallax, transition choreography, velocity and continuity. Produces a motion spec with exact values; does not edit code. Use when a page has scroll-driven or choreographed motion.

- **Mode / temperature:** subagent / 0.3
- **Edits code:** no · **Shell:** none
- **MCPs:** on: playwright, chrome-devtools, context7, motion, gsap; off: blender, serena, headroom, github, shadcn
- **Skills loaded via `skill({ name })` (24):** animate, animation-vocabulary, awwwards-playbook, cinematic-gsap-lenis-motion-system, design-motion-principles, emil-design-eng, fixing-motion-performance, gsap-core, gsap-performance, gsap-plugins, gsap-react, gsap-scrolltrigger, gsap-scrolltrigger-storytelling, gsap-timeline, gsap-utils, marquee-loop, masked-reveal, motion, reveal-hover-effect, review-animations, scroll-craft, scroll-scrubbed-visual-sequence, staggered-word-reveal, vercel-react-view-transitions
- **MCP tools called by exact name (18):** `chrome-devtools_evaluate_script`, `chrome-devtools_new_page`, `chrome-devtools_performance_analyze_insight`, `chrome-devtools_performance_start_trace`, `chrome-devtools_performance_stop_trace`, `context7_query-docs`, `context7_resolve-library-id`, `gsap_create_production_pattern`, `gsap_debug_animation_issue`, `gsap_get_gsap_api_expert`, `gsap_get_gsap_guidance`, `gsap_optimize_for_performance`, `gsap_validate_gsap_code`, `motion_search-motion-docs`, `playwright_browser_evaluate`, `playwright_browser_navigate`, `playwright_browser_take_screenshot`, `playwright_browser_wait_for`
- **Asset libraries / effect libs (6):** Lenis, GSAP, Motion, View Transitions, Rive, Lottie
- **Output contract:** Evidence · Motion character · Intro timeline · Tokens · Scroll system · Choreography · Signature moment · Hover system · Section transitions · Page/route transitions · Continuity rules · Reduced motion · Perf notes

### threejs-art-director

Makes the visual decisions for 3D scenes — camera, framing, scale, lighting, materials, environment, depth, 3D/DOM composition, camera and object choreography. Not a programmer; produces a scene spec engineers implement. Use whenever a page has a WebGL/R3F/three.js moment.

- **Mode / temperature:** subagent / 0.4
- **Edits code:** no · **Shell:** none
- **MCPs:** on: context7, github, blender; off: chrome-devtools, serena, headroom, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (8):** asset-forge, asset-library, awwwards-playbook, blender-hard-surface-modeling, build-threejs-scroll-worlds, shader-dev, threejs-scenes, webgl-3d-object
- **MCP tools called by exact name (12):** `blender_get_polyhaven_asset_preview`, `blender_get_polyhaven_categories`, `blender_get_scene_info`, `blender_get_sketchfab_model_preview`, `blender_get_viewport_screenshot`, `blender_search_polyhaven_assets`, `blender_search_polypizza_models`, `blender_search_sketchfab_models`, `context7_query-docs`, `context7_resolve-library-id`, `github_get_file_contents`, `github_search_code`
- **Asset libraries / effect libs (6):** Poly Haven, Sketchfab, Mixamo, cobe, drei, postprocessing
- **Output contract:** Role of 3D · Camera · Scale & layout · Lighting · Materials · Assets · Shaders · Environment/depth · Choreography · 3D↔DOM composition · Mobile · Performance budget · Avoid

### responsive-specialist

Determines how the design transforms across viewports (desktop → tablet → mobile, plus intermediate breakpoints) — layout, typography, 3D framing, motion cuts, navigation, touch — using measured captures. Read-only. Use after desktop converges, or when a specific viewport is broken.

- **Mode / temperature:** subagent / 0.2
- **Edits code:** no · **Shell:** *visual-fidelity/scripts/vf *, ls *
- **MCPs:** on: playwright, chrome-devtools; off: blender, github, serena, headroom, context7, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (5):** apple-design, fixing-accessibility, visual-fidelity, web-design-guidelines, web-perf
- **MCP tools called by exact name (10):** `chrome-devtools_emulate`, `chrome-devtools_lighthouse_audit`, `chrome-devtools_new_page`, `chrome-devtools_take_screenshot`, `playwright_browser_click`, `playwright_browser_evaluate`, `playwright_browser_navigate`, `playwright_browser_resize`, `playwright_browser_snapshot`, `playwright_browser_take_screenshot`
- **Asset libraries / effect libs (1):** Motion
- **Output contract:** Breakpoints · Transformation table · Typography scale · Navigation · 3D & media · Motion changes · Touch · Measured defects

### visual-critic

Compares the current render against the reference (or the art-direction spec) using measured captures and returns the smallest set of prioritized, evidence-backed fixes. Never edits code. Use after every implementation pass and before declaring visual work done.

- **Mode / temperature:** subagent / 0.1
- **Edits code:** no · **Shell:** *visual-fidelity/scripts/vf *, ls *
- **MCPs:** on: playwright, chrome-devtools; off: blender, github, context7, serena, headroom, shadcn, motion, gsap
- **Skills loaded via `skill({ name })` (7):** audit-ai-design-slop, awwwards-playbook, design-taste-frontend, fixing-accessibility, impeccable, review-animations, visual-fidelity
- **MCP tools called by exact name (8):** `chrome-devtools_get_css_styles`, `chrome-devtools_lighthouse_audit`, `chrome-devtools_new_page`, `chrome-devtools_take_snapshot`, `playwright_browser_evaluate`, `playwright_browser_hover`, `playwright_browser_navigate`, `playwright_browser_take_screenshot`
- **Asset libraries / effect libs (1):** Motion
- **Output contract:** Scorecard · Motion parity / gates · P0 — must fix next · P1 — after P0 · P2 — polish · Do not fix · Unjustified elements · Evidence · Next iteration priorities

### asset-producer

Produces the real visual assets a page needs — CC0 photography, Poly Haven HDRIs/models, headless-Blender studio renders, scroll-scrub image sequences, procedural glass/chrome/liquid-metal hero objects (optimised glTF), Blender-MCP modelling, AI images when a key exists — into public/. Never draws assets with CSS/SVG. Writes only public/**, .design/** and ATTRIBUTION.md.

- **Mode / temperature:** subagent / 0.3
- **Edits code:** yes · **Shell:** *asset-forge/scripts/forge *, *visual-fidelity/scripts/vf capture*, ls *, mkdir -p *, cp *, cp ~/.agents/skills/asset-forge/scripts/templates/*
- **MCPs:** on: blender; off: chrome-devtools, github, serena, shadcn, gsap, motion, headroom
- **Skills loaded via `skill({ name })` (2):** asset-forge, asset-library
- **MCP tools called by exact name (5):** `blender_execute_blender_code`, `blender_export_scene`, `blender_generate_hyper3d_model_via_text`, `blender_get_scene_info`, `blender_get_viewport_screenshot`
- **Asset libraries / effect libs (0):** —

### builder

The single code implementer the frontend orchestrator hands bounded build tasks to — sections, components, motion, WebGL, fixes from the critique. Writes code only in the files the task names; uses the playbook recipes and the real assets in public/. Never produces assets and never delegates.

- **Mode / temperature:** subagent / 0.2
- **Edits code:** yes · **Shell:** 
- **MCPs:** on: chrome-devtools, context7, serena, motion, shadcn, gsap; off: blender, github, headroom
- **Skills loaded via `skill({ name })` (22):** asset-library, awwwards-playbook, baseline-ui, cinematic-gsap-lenis-motion-system, fixing-accessibility, fixing-metadata, fixing-motion-performance, frontend-ui-engineering, gsap-plugins, gsap-react, gsap-scrolltrigger, gsap-timeline, motion, shadcn, shader-dev, tailwind-design-system, threejs-scenes, vercel-composition-patterns, vercel-react-best-practices, web-perf, webapp-testing, webgl-3d-object
- **MCP tools called by exact name (12):** `chrome-devtools_list_console_messages`, `chrome-devtools_list_network_requests`, `chrome-devtools_new_page`, `context7_query-docs`, `context7_resolve-library-id`, `gsap_create_production_pattern`, `gsap_generate_complete_setup`, `gsap_validate_gsap_code`, `motion_search-motion-docs`, `serena_find_symbol`, `shadcn_get_add_command_for_items`, `shadcn_search_items_in_registries`
- **Asset libraries / effect libs (9):** GSAP, View Transitions, React Bits, Magic UI, cobe, R3F, drei, postprocessing, shadcn
