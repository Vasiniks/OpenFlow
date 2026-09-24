# Architecture: the OpenFlow frontend fleet

Goal: give OpenCode a reference plus an objective, and have it converge through measured render → critique → fix loops, instead of stalling at 50–70% because nobody can say *what* is wrong.

## Architecture: thinking vs. execution

```
                    ┌──────────── frontend (primary: brief · team choice · loop · single writer) ────────────┐
THINKING (read-only)│ reference-analyst · art-director · interaction-designer · motion-designer ·            │
                    │ threejs-art-director · responsive-specialist · visual-critic   → specs in .design/     │
EXECUTION           │ frontend itself, or ONE `general` subagent per bounded task (never two writers)         │
                    │ frontend-architect = spec-only, called for new projects / structural changes            │
                    └──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Changes from the requested design, and why:**

1. **Added the `frontend` primary orchestrator.** There were no custom agents; `build` was the only orchestrator. A separate primary leaves general coding untouched.
2. **All 8 specialists are read-only** (`edit: deny`). They return specs, and the orchestrator files them in `.design/`. This enforces "no two agents editing the same files" through configuration, not through a prompt. Specialists can consult each other in layers (below), but none of them can reach `general`, the only other writer.
3. **The frontend-architect is spec-only** and runs once per project or structural change, not every loop.
4. **Measurement is a tool, not a persona.** The biggest gap was that the agent compared screenshots holistically. `vf` gives every agent the same numbers.
5. **Bash is restricted to `vf`** for the three agents that need captures. The others have no shell. Each agent disables the MCPs it doesn't need (Blender, GitHub, Serena, headroom, DevTools), keeping context small.

## Layered delegation (agents calling agents)

`frontend` calls the specialists; some specialists may **consult** others. Each agent's `permission.task` allow-list enforces who may call whom, not the prompt. The graph is acyclic, at most 2 layers below a specialist, and read-only below `frontend`:

| Agent | May consult | Typical reason |
|---|---|---|
| art-director | threejs-art-director, motion-designer, reference-analyst | check a 3D-centric thesis is feasible; turn motion principles into tokens; HYBRID structure |
| interaction-designer | motion-designer, reference-analyst | feedback timing for a behavior; probe an uncertain reference behavior |
| responsive-specialist | visual-critic, reference-analyst | fresh P0 ranking at one viewport; reference behavior at an uncaptured width |
| frontend-architect | explore | map a large codebase when Serena can't |
| motion-designer · threejs-art-director · visual-critic | reference-analyst | measure reference motion / 3D framing / a region the capture JSON misses |
| reference-analyst | — (leaf: the measuring instrument) | |

**Why it doesn't break the design:**
- **Single writer:** no path from any specialist to `general`, and `openflow doctor` asserts this.
- **Specs on disk:** consulted answers come back tagged `(via X)` inside the lead's spec.
- **Consultations stay narrow:** one question, 15–25 lines, at most 2–3 per run, and never for something already in `.design/`. So they don't replace the full specialist pass; the orchestrator still calls, e.g., motion-designer when the pipeline needs the full motion spec.

**Cost:** one extra subagent round-trip per consultation (typically 1–3 minutes). The pipelines in §1 of `frontend.md` are unchanged.

## GSAP MCP

`@osaidrajput9/gsap-mcp@2.0.5`, pinned. There is still no official GreenSock MCP.

**Why this one:** it serves the **official** `greensock/gsap-skills` byte-for-byte (the same commit as the installed skills, verified), plus two verified errata. Its unique value over the skills is `validate_gsap_code`: 14 deterministic checks with rule ids. In a live test it caught a missing effect cleanup, a `left` layout animation, and an unregistered ScrollTrigger.

**Audit:** the published tarball has no network, subprocess, file-write or install-script code. It has one maintainer and no npm provenance, hence the exact pin.

**Used by:**
- **motion-designer:** guidance, api-expert, production patterns, validate/debug/optimize existing code.
- **frontend-architect:** `generate_complete_setup`.
- **frontend / implementer:** `validate_gsap_code` as a gate (0 errors) before every capture.
- **Other agents:** switched off.

## Invocation: task-dependent teams (from `frontend.md`)

| Task | Pipeline |
|---|---|
| Recreate a reference | reference-analyst → (art-director only for substitutions) → (frontend-architect if structural) → implement → loop → responsive-specialist → loop |
| 3D/product site | art-director → threejs-art-director → interaction-designer → motion-designer → frontend-architect → implement → loop |
| Marketing/brand site | art-director → interaction-designer → motion-designer → frontend-architect → implement → loop → responsive-specialist → loop |
| "Looks off" | visual-critic → fix → loop |
| Motion problem | motion-designer (+ reference-analyst) → fix → loop |
| Mobile problem | responsive-specialist → fix → loop |

## Skills, MCPs and asset libraries per specialist (embedded as exact calls)

Every agent has a **Calls** table: a step, the exact invocation, and what to take from it.
- **Skills:** `skill({ name: "gsap-scrolltrigger" })`.
- **MCP tools:** real OpenCode names and parameters, e.g. `chrome-devtools_list_network_requests({ pageId, resourceTypes: ["font"] })` or `blender_search_polyhaven_assets({ asset_type: "hdris", category: "studio" })`.
- **Asset APIs:** exact keyless URLs.
- **Libraries:** pinned packages with the canonical wiring (e.g. Lenis ↔ GSAP ticker).

Tool names and arguments were taken from each server's live `tools/list` (`mcp-tools.mjs`), not from memory. The full per-agent lists are in [AGENTS.md](AGENTS.md).

`openflow doctor` re-checks all of it:
- every `skill(...)` name resolves in OpenCode;
- every MCP call names a real tool, with valid and required arguments, and isn't disabled for that agent;
- every shell call is allowed by that agent's bash rules;
- the asset APIs answer.

`--live` additionally has `frontend` summon each specialist, which in turn consults its consultant. It then compares the tools each one really has at runtime and confirms the delegation chains work.

## The loop

```
brief (.design/brief.md: mode RECREATE | DESIGN | HYBRID, viewports)
→ specs (.design/*.md)
→ implement region by region (layout → type → color/material → motion)
→ vf capture (fixed viewports, same scroll fractions, settle rules)
→ vf compare  (pixel hotspots · element Δ in vw/vh · font ratios · omissions · extras)
→ visual-critic: ≤5 P0 as OBSERVATION / INTERPRETATION / RECOMMENDATION + unjustified elements
→ save critique verbatim (.design/cur/iter-N/critique.md) → apply P0 only → log in .design/decisions.log
→ vf track (trend; BEST iteration; exit 3 on regression → vf compare best-vs-latest → revert/redo)
→ capture again
stop: only on the BEST iteration, after a fresh visual-critic verdict; ≤3 iterations per viewport set,
      or P0 empty and track shows <10% improvement
order: primary desktop → responsive-specialist → mobile/tablet → intermediate sizes
rules: verify explanations before acting (cmp files, diff iterations, measure the reference DOM);
       fix causes, not metrics (no tracking/scale hacks to make a wrong asset fit)
```

`vf` commands: `capture` (render + DOM layout report), `compare` (ref vs current: hotspots, element Δ, omissions, extras, side-by-side/diff PNGs), `track` (trend + regression guard).

Grounding for the design:
- **Layout-first decomposition by region** (LaTCoder: −38% layout error; DCGen: up to +15% visual similarity).
- **Critic-in-the-loop, capped at about 3 cycles** (up to +17.8%, with diminishing returns after).
- **Failures are omission, misarrangement and distortion**, so the critic triages in that order.

## Test: recreate the lenis.dev hero (RECREATE, 1440×900 + 390×844)

**Fleet vs. control.** Same brief, same reference captures, both production builds, same `vf` scoring. The control was OpenCode's default `build` agent (with superpowers and all existing skills; the two new skills denied), running in a clean copy with no `.design/`.

| | Desktop 1440 mismatch | Desktop matched | Mobile 390 mismatch | Mobile matched |
|---|---|---|---|---|
| **Fleet** (final) | **0.62%** | **18/22** | **4.16%** | **16/18** |
| Control (`build`) | 13.73% | 15/22 | 27.7% | 9/18 |

- **Fleet:** the layout is indistinguishable from the reference: every text and SVG element sits at Δ0 with the right fonts (Panchang 700, Anton, Roboto 900) and exact colors. The only residual is the WebGL plume *shape* in the backdrop (soft glow where the reference has sharp light streaks).
- **Control:** a recognizable Lenis hero, but the composition is off: the wordmark is too high and too large, "SMOOTH SCROLL" crowds under it, a central rose glow replaces the black field, and mobile CTAs and spacing are wrong. This is the "50–70%" failure mode.

**Fleet iteration trend** (`vf track`, desktop): 1.02% → 0.54% → (regression) 1.61 / 1.64 / 1.62% → 0.59% → 0.62%. Mobile: 8.8% → 4.81 → 4.80 → 4.19 → 4.17%.

**What the test caught and fixed in the system** (each became a rule or tool change):

1. The first orchestrator brief *guessed* reference content and pre-decided a font substitution. Fix: the brief records only what the user said; facts come from the measured spec.
2. The run died on a `/tmp` permission auto-reject. Fix: scratch work stays in `.design/`, and `/tmp` is allowed for the orchestrator.
3. The critic's text wasn't saved. Fix: `critique.md` is saved verbatim per iteration.
4. The orchestrator ignored the critic's "matcher artifact" verdict on the h2, invented a "narrower font cut" theory, faked it with 6.55px letter-spacing, regressed desktop 3×, blamed canvas noise, and declared convergence after a single critic pass. Fixes:
   - `vf track` regression guard, plus best-vs-latest attribution
   - letter-spacing and weight deltas score as defects
   - "best" ranks by pixels first, so boxes can't be gamed
   - stopping requires a fresh critic verdict on the best iteration
   - "verify explanations before acting" (the real font file turned out byte-identical)
   - "fix causes, not metrics"

   **Re-run with the fixes:** it attributed 100% of the regression to the h2, proved the font identical, measured the reference's grid-cell box, reverted the hack, and recovered desktop to 0.59% and mobile to 4.17%. The final critic verdict had P0 = 0 at both viewports.
5. Tool false positives found during the test: `next/font` renames families, and the matcher cross-paired far-apart SVGs. Fixes: family-alias normalization and distance/size-limited matching.

**Critique quality:**
- Every issue came as OBS/INT/REC with coordinates and values.
- It gave at most 5 P0s, ranked by visual impact.
- It explicitly listed what *not* to fix (anti-aliasing, star randomness, matcher false alarms) with the screenshot reasoning behind each.
- It found the Next.js dev badge unprompted, as an "unjustified element".

## Remaining weaknesses (honest)

- **Shader and WebGL fidelity** is judged by eye only. Without the reference shader source, the plume shape plateaus. Pixel metrics on animated canvases are noisy (roughly ±0.1% desktop), so compare atmosphere visually.
- **Pseudo-element backgrounds** (`::before`/`::after`) aren't in the DOM walk. They show up only in pixels and side-by-sides; the reference analyst gets them through Chrome DevTools `get_css_styles`.
- **The orchestrator follows rules imperfectly.** In run 3 it skipped the 2nd critic pass and invented an explanation. The new rules and `track` exit codes make those failures visible, but they're still prompt-enforced, not hard-enforced; a plugin hook could make "no stop without a critic verdict" mandatory.
- **Only the RECREATE pipeline was tested end-to-end.** DESIGN mode (art-director, 3D art director, interaction/motion designers) is configured and parses, but it hasn't been run against a brief yet.
- **Motion fidelity isn't measured over time.** `vf` captures stills at scroll positions, not easing curves.
- **Cost and time:** a full recreate ran about 25–35 min on Muse Spark across several runs. The control was faster but converged to a much worse result.

## What NOT to add (would add complexity without better sites)

- **More personas** (e.g. a "copywriter", "brand strategist", "SEO agent"). None of today's failures came from missing opinions; they came from missing *measurement* and weak *loop discipline*.
- **Parallel writers or specialist-per-file implementers.** Single-writer plus specs on disk is what kept the loop attributable.
- **An autonomous "Awwwards expert" mega-prompt or bigger agent files.** Prompts here are 2–7k characters. The gains came from `vf`, `track` and the rules, not from prose.
- **Perceptual AI scores (CLIP/SSIM dashboards)** as the stop criterion. Pixel + element deltas plus a critic reading the images was enough, and every extra metric is another thing to game.
- **Always-on specialists.** The orchestrator's task-dependent teams were right: the recreate test never needed the interaction, motion or 3D designers.
- **ECC-style bulk skill packs.** Each agent gets a named toolbox of what it actually uses.

## Live test: one-shot `/awwwards` (Halo headphones brief), 2026-09-24

Same brief, fresh Next.js project each time, OpenCode + Muse Spark, no human input.

| | Run 1 (overhaul v1) | Run 2 (after run-1 fixes) |
|---|---|---|
| Result | first pass only: the run died before its critique loop (temp-dir permission) | full pipeline, 10 iterations, 2 critic verdicts, gate table |
| Art direction | concept + 3 measured references (teardowns) + section/asset plan | same, plus a WebGL hero decision |
| Hero asset | Blender-rendered **chrome knot** (stand-in: there was no way to model the product) | the **product itself**, modelled in headless Blender (titanium band, ceramic pods, fabric grilles), shown in real-time WebGL |
| Other assets | some **code-painted** images (PIL "brushed metal", a grey "pebble" case) | Cycles renders of the model, 60-frame turntable, CC0 photos graded in Blender; 0 CSS/code-painted art |
| Motion | Lenis + GSAP (78 animated elements), SplitText, pinned 48-frame sequence hero, pinned horizontal track, text-roll nav | intro counter → curtain → staged hero, pinned material track, pinned 250vh scrub with sequence + exploded view, SplitLines everywhere, magnetic CTA |
| Gates | not evaluated (no loop) | 8 pass · 3 conditional (3D, perf, a11y) · 1 fail (cross-route transition) |

Failures each run exposed, all now fixed:
- **`/dev` redirect auto-rejected.** Asset-producer died on its first `2>/dev/null` because non-interactive runs auto-reject any "ask" permission. Every agent now allows `/dev`, the system temp dirs, and the tool/cache dirs.
- **Orchestrator making assets itself.** It filled in with curl'd stock and PIL image-painting after the asset-producer failed. It's now forbidden; the orchestrator retries asset-producer instead.
- **No way to model a bespoke product.** Added `forge blender` plus a product modelling template.
- **Meshopt `.glb` unreadable by Blender.** Switched to Draco.
- **The built-in `general` implementer couldn't be given directory permissions.** It's replaced by the `builder` agent.
- **"Macro" shots were full-product shots.** Added `--shot macro` with `--focus`, surface-focused DOF, and scale-normalised renders.
- **The critic was lenient** on a titanium band rendering flat white and on a two-word-wide text column over the product. Broken materials and illegible overlays are now P0.

Still open:
- Teardown's hover probe misses some child-span CSS transitions (the critic flagged working hovers).
- WebGL material setup still needs the critic's eye.
- Runs take about 2 hours on Muse Spark.
