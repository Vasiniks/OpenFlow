# OpenFlow

One install for the skills, MCP servers, plugins and frontend agent fleet that turn a coding agent into a high-end frontend studio. Built for **OpenCode**; it also installs into every other harness it detects (Claude Code, Muse Code, Codex CLI, Cursor, Gemini CLI). Runs on **macOS, Linux and Windows**.

## Install

**macOS / Linux**
```sh
curl -fsSL https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.sh | bash
```

**Windows** (PowerShell)
```powershell
irm https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.ps1 | iex
```

The bootstrap does the following:
1. Makes sure you have git, Node.js 20+ and [uv] (installing them via Homebrew, winget or uv's own installer if missing).
2. Clones OpenFlow into `~/.openflow`.
3. Adds an `openflow` command.
4. Runs `openflow install`.

Re-run it any time to update: it's idempotent.

```sh
openflow doctor                 # read-only check of everything below, per harness
openflow doctor --live          # + OpenCode live test: frontend summons every specialist, each consults its consultant
openflow fix                    # find what's broken and repair it (see below)
openflow fix --dry-run          # show the repairs without making them
openflow run recreate https://example.com      # one-shot /recreate in this folder; resumes after network drops/sleep
openflow run awwwards "brief…" --log run.log  # same for /awwwards, with a log file
openflow install --only opencode,claude          # limit to some harnesses
openflow install --skip plugins,agents           # skip steps (tools, skills, mcp, plugins, agents)
openflow install --dry-run                       # print what would change
openflow list                                    # which harnesses were detected
```
`openflow fix` checks everything and repairs what it can:
- **Tools:** git, npx, uv, serena, headroom, the Playwright browsers, and the `vf` script dependencies.
- **Skills:** missing or outdated ones, including OpenFlow's own, which are compared file by file with the repo.
- **GitHub MCP:** the server binary and its wrapper.
- **Blender:** the add-on.
- **MCP servers:** each one gets a live probe (start it, list its tools) and, if it fails, a targeted repair followed by a re-probe:
  - npx servers: the cached package is cleared and fetched again;
  - uv tools: reinstalled;
  - GitHub: the binary is downloaded again.
- **Harness configs:** missing MCP entries are added. An entry that points at a file that no longer exists, or fails its probe while OpenFlow's definition works, is replaced (with a backup). Entries you've disabled are left alone.
- **OpenCode fleet:** agent and command files that are missing or outdated are reinstalled.

What it can't do on its own (`gh auth login`, installing Chrome, network problems) it lists with the exact command. It exits 1 while anything is left.

Passing flags through the one-liner: `… | bash -s -- --only opencode` (macOS/Linux), or on Windows:
`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.ps1))) --only opencode`

## What gets installed

| Layer | What |
|---|---|
| **Skills** | ~125 skills from their authors' repos via the [`skills`](https://github.com/vercel-labs/skills) CLI. Frontend: design taste, GSAP (official), Motion, Emil Kowalski's animation skills, Vercel React/Next, shadcn, Tailwind, three.js, shaders, Blender, web-perf, accessibility. Engineering: spec/TDD/debugging/review workflows. Award-level web design: 26 of Meng To's skills. OpenFlow's own: `visual-fidelity` (incl. `vf teardown`), `asset-forge`, `awwwards-playbook`, `asset-library` |
| **MCP servers** | `playwright`, `chrome-devtools`, `context7` (live docs), `github` (read-only; token read from `gh` at launch, never stored), `blender` (Poly Haven / Sketchfab / Poly Pizza assets), `headroom` (context compression), `serena` (code intelligence), `motion` (official Motion docs), `shadcn` (component registries), `gsap` (official GreenSock skills + a GSAP code validator) |
| **Plugins** | Claude Code: superpowers, frontend-design, impeccable, ui-ux-pro-max, typescript-lsp, claude-md-management, claude-hud, plus the Motion `motion-reviewer` agent. OpenCode: superpowers (+ rtk if Homebrew is available). Muse: superpowers |
| **Tools** | serena, headroom, spec-kit (`specify`), codeburn, typescript-language-server, gltf-transform, Playwright Chromium, GitHub MCP binary (checksum-verified), Blender MCP add-on (if Blender is installed) |
| **Agent fleet** | 10 OpenCode agents + `/awwwards`, `/recreate` and `/critique` commands (below) |

### Harness support

| Harness | Skills | MCP servers | Plugins | Agent fleet |
|---|---|---|---|---|
| OpenCode | ✓ | ✓ | ✓ | ✓ |
| Claude Code | ✓ | ✓ | ✓ | — |
| Muse Code | ✓ | ✓ | ✓ | — |
| Codex CLI | ✓ | ✓ | — | — |
| Cursor | ✓ | ✓ | — | — |
| Gemini CLI | ✓ | ✓ | — | — |

## The frontend fleet (OpenCode)

Open a project in OpenCode, press **Tab** until the agent is `frontend`, then:

```
/awwwards "Launch site for <product>. Audience … Tone … Needs …"   # one-shot an original award-level site
/recreate https://example.com                                      # recreate a site: every section, motion, 3D, pages
/critique /                                                        # measured critique + award gates, no code changes
make the sections pin and scrub on scroll                          # or just describe what you want
```

**How to prompt it** (what to include, strong vs weak examples, follow-ups that move quality): [docs/PROMPTING.md](docs/PROMPTING.md).

### What makes it award-level
- **`vf teardown <url>`** reverse-engineers any reference with Playwright. It captures:
  - the intro frames and a video;
  - contact sheets of a full scroll;
  - a motion map (scroll-linked, reveals with fitted duration and ease, pins, split text);
  - hover diffs, the custom cursor, menu states and page transitions;
  - the library stack, and the site's own GSAP eases, durations and ScrollTrigger configs pulled from its JS;
  - the **live three.js scene** (tone mapping, lights, PBR materials, meshes) and **every GLSL shader it compiles**;
  - the real font, model, HDRI, Lottie and image files.
- **`forge`** makes real assets instead of CSS art:
  - CC0 photography and Poly Haven HDRIs and models;
  - headless-Blender studio renders on a seamless cove with real HDRI light;
  - Apple-style scroll-scrub image sequences;
  - procedural glass, chrome, liquid-metal, crystal and silk hero objects exported as optimised glTF;
  - AI images when you have a key.
- **`awwwards-playbook`**:
  - the jury rubric (Design 40 / Usability 30 / Creativity 20 / Content 10);
  - a measurable definition of done that the critic checks against a teardown of the build;
  - a signature-feature menu;
  - tested Next.js recipes (Lenis + GSAP, preloader, split-line reveals, clip reveals, pinned tracks, image sequences, R3F hero, hover systems);
  - superprompt templates.
- **26 skills from [Meng To's collection](https://github.com/MengTo/Skills)** (cinematic motion systems, video → superprompt, anti-slop audits, honest asset rules) plus the official GSAP skills and MCP.

`frontend` is the orchestrator and writes the code. `asset-producer` writes asset files only. Everyone else is a read-only specialist, and some specialists consult each other:

| Agent | Answers | Consults |
|---|---|---|
| reference-analyst | What exactly does the reference do, and how is it built? Teardown plus hands-on Playwright exploration of every page and state, written up as a superprompt spec | — |
| asset-producer | Produces every asset: photos, HDRIs, models, Blender renders and sequences, procedural glTF, AI images. Writes only `public/**` | — |
| art-director | What should it look and feel like? | threejs-art-director, motion-designer, reference-analyst |
| interaction-designer | What happens when the user does something? | motion-designer, reference-analyst |
| motion-designer | How exactly does it move? (GSAP / Lenis / Motion values) | reference-analyst |
| threejs-art-director | Camera, light, materials, 3D↔DOM composition | reference-analyst |
| frontend-architect | How to build it so the design survives | explore |
| responsive-specialist | What each region becomes at each size | visual-critic, reference-analyst |
| visual-critic | What's wrong, ranked, with evidence | reference-analyst |

Every change goes through a measured loop:
1. `vf capture` and `vf compare` measure pixels and layout.
2. `vf teardown` of the build measures its motion, assets and 3D. Against the reference that gives **motion parity**; for original work, the **award gates**.
3. The critic gives every inventory row a status and lists all P0/P1 findings. Fake assets, missing choreography and missing measurements are automatically P0.
4. The orchestrator fixes all P0 and P1 and loops (up to 8 rounds) until:
   - the inventory is done;
   - feel parity is ≥ 90% (or the award gates pass);
   - the critic reports 0 P0.

   Then it stops once, with two A/B alternatives, for your feedback. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), per-agent tools: [docs/AGENTS.md](docs/AGENTS.md).

## Safety

- **Never overwrites your MCP entries**: it only adds missing ones. Every config it touches is copied to `~/.openflow/backups/<timestamp>/` first.
- **Pinned versions** for everything that can be pinned (`lib/manifest.mjs`).
- The GSAP MCP (`@osaidrajput9/gsap-mcp@2.0.5`) was audited before it was pinned: no network calls, subprocesses, file writes or install scripts.
- **The GitHub MCP is read-only.** Its token comes from `gh auth token` each time it starts.
- **Skills are installed from their authors' repositories** and keep their authors' licenses; OpenFlow doesn't redistribute them.

## Extending

- **Add a skill source, MCP server or plugin:** edit `lib/manifest.mjs` (and `lib/mcp.mjs` for servers).
- **Add a harness:** add an adapter to `lib/harnesses.mjs` with `detect()`, `skillsTarget` (a [`skills` CLI agent id](https://github.com/vercel-labs/skills)), `mcpNames()` and `addMcp(servers)`. Optionally add `plugins(ctx)` and `installAgents(repo)`.
- **Bring the fleet to another harness:** implement `installAgents` for it, translating the tool names in `agents/opencode/*.md`. OpenCode calls MCP tools `server_tool` and skills via `skill({ name })`; other harnesses have their own conventions, and some (e.g. Claude Code) don't let subagents call subagents.

## Uninstall

OpenFlow only adds things, so undo is manual:
- remove the agents from `~/.config/opencode/{agents,commands}`;
- remove the MCP entries from each harness's config (or restore a file from `~/.openflow/backups/`);
- `npx skills remove -g <name>`;
- delete `~/.openflow`.

## Status

Tested end-to-end on macOS (Apple Silicon) with OpenCode, Claude Code, Muse Code and Codex CLI. The Windows bootstrap (PowerShell 5.1+, winget) and the Cursor and Gemini CLI adapters follow those tools' documented formats but haven't been run on a real machine yet. Please open an issue if something breaks.

[uv]: https://docs.astral.sh/uv/
