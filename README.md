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
openflow install --only opencode,claude          # limit to some harnesses
openflow install --skip plugins,agents           # skip steps (tools, skills, mcp, plugins, agents)
openflow install --dry-run                       # print what would change
openflow list                                    # which harnesses were detected
```
Passing flags through the one-liner: `… | bash -s -- --only opencode` (macOS/Linux), or on Windows:
`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.ps1))) --only opencode`

## What gets installed

| Layer | What |
|---|---|
| **Skills** | ~95 skills from their authors' repos via the [`skills`](https://github.com/vercel-labs/skills) CLI. Frontend: design taste, GSAP (official), Motion, Emil Kowalski's animation skills, Vercel React/Next, shadcn, Tailwind, three.js, shaders, Blender, web-perf, accessibility. Engineering: spec/TDD/debugging/review workflows. OpenFlow's own: `visual-fidelity` and `asset-library` |
| **MCP servers** | `playwright`, `chrome-devtools`, `context7` (live docs), `github` (read-only; token read from `gh` at launch, never stored), `blender` (Poly Haven / Sketchfab / Poly Pizza assets), `headroom` (context compression), `serena` (code intelligence), `motion` (official Motion docs), `shadcn` (component registries), `gsap` (official GreenSock skills + a GSAP code validator) |
| **Plugins** | Claude Code: superpowers, frontend-design, impeccable, ui-ux-pro-max, typescript-lsp, claude-md-management, claude-hud, plus the Motion `motion-reviewer` agent. OpenCode: superpowers (+ rtk if Homebrew is available). Muse: superpowers |
| **Tools** | serena, headroom, spec-kit (`specify`), codeburn, typescript-language-server, gltf-transform, Playwright Chromium, GitHub MCP binary (checksum-verified), Blender MCP add-on (if Blender is installed) |
| **Agent fleet** | 9 OpenCode agents + `/recreate` and `/critique` commands (below) |

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
/recreate https://example.com            # measured recreation: desktop, then mobile
/critique /                              # measured critique of a route, no code changes
make the sections pin and scrub on scroll # or just describe what you want
```

`frontend` is the orchestrator and the only agent that writes code. It calls read-only specialists as the task needs them, and some specialists consult each other:

| Agent | Answers | Consults |
|---|---|---|
| reference-analyst | What exactly is the reference doing? (measured: layout in vw/vh, real font files, assets, motion) | — |
| art-director | What should it look and feel like? | threejs-art-director, motion-designer, reference-analyst |
| interaction-designer | What happens when the user does something? | motion-designer, reference-analyst |
| motion-designer | How exactly does it move? (GSAP / Lenis / Motion values) | reference-analyst |
| threejs-art-director | Camera, light, materials, 3D↔DOM composition | reference-analyst |
| frontend-architect | How to build it so the design survives | explore |
| responsive-specialist | What each region becomes at each size | visual-critic, reference-analyst |
| visual-critic | What's wrong, ranked, with evidence | reference-analyst |

Every change goes through a measured loop. `vf capture` renders fixed viewports; `vf compare` produces pixel hotspots, element deltas, omissions and extras; the critic returns at most 5 must-fix issues; the orchestrator fixes only those; `vf track` guards against regressions. It stops on the best iteration, and only after a fresh critic verdict. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), per-agent tools: [docs/AGENTS.md](docs/AGENTS.md).

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
