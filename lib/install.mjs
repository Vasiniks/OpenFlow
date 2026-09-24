// install: tools → skills → MCP servers → plugins → agents. Idempotent: only adds what's missing,
// never overwrites your existing MCP entries, backs up every config file it changes.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir, arch } from "node:os";
import { V, SKILL_SOURCES, CLAUDE_VIA_PLUGIN } from "./manifest.mjs";
import { mcpServers } from "./mcp.mjs";
import { detectHarnesses } from "./harnesses.mjs";
import { HOME, WIN, MAC, OPENFLOW_HOME, BACKUPS, join, run, probe, which, step, info, warn, bold, green, isDryRun, writeText } from "./util.mjs";

export async function install({ repo, only, skip = new Set() }) {
  step("Detecting harnesses");
  const hs = detectHarnesses(only);
  if (!hs.length) { warn("No supported harness found (OpenCode, Claude Code, Muse, Codex, Cursor, Gemini CLI). Install one, then re-run."); return 1; }
  info(hs.map((h) => bold(h.name)).join(" · "));

  const ctx = { home: OPENFLOW_HOME, repo };
  if (!skip.has("tools")) await tools(ctx);
  else resolveTools(ctx);
  if (!skip.has("skills")) await skills(hs, ctx);
  if (!skip.has("mcp")) {
    step("MCP servers (added only where missing; existing entries are left alone)");
    for (const h of hs) h.addMcp(mcpServers(ctx, h.mcpOpts));
  }
  if (!skip.has("plugins")) {
    step("Plugins & hooks");
    for (const h of hs) if (h.plugins) h.plugins(ctx);
  }
  if (!skip.has("agents")) {
    step("Agents");
    for (const h of hs) h.installAgents ? h.installAgents(repo) : info(`${h.name}: no agent adapter yet (skills + MCPs installed). See README → Extending.`);
  }
  step("Done");
  if (existsSync(BACKUPS)) info(`Backups of changed configs: ${BACKUPS}`);
  info(`Restart open sessions, then run ${bold("openflow doctor")} (or: node ${join(OPENFLOW_HOME, "openflow.mjs")} doctor)`);
  return 0;
}

// ------------------------------------------------------------------------------------------------ tools
function resolveTools(ctx) {
  const binDir = probe("uv", ["tool", "dir", "--bin"]).stdout.trim();
  const exe = (n) => { const p = binDir && join(binDir, WIN ? `${n}.exe` : n); return p && existsSync(p) ? p : which(n); };
  ctx.uvx = which("uvx");
  ctx.serena = exe("serena");
  ctx.headroom = exe("headroom");
  const gw = join(OPENFLOW_HOME, "bin", "github-mcp.mjs");
  ctx.githubWrapper = existsSync(gw) && existsSync(join(OPENFLOW_HOME, "bin", WIN ? "github-mcp-server.exe" : "github-mcp-server")) ? gw : null;
  ctx.motionReviewer = existsSync(join(OPENFLOW_HOME, "cache", "motion-ai", "package", "content", "agents", "motion-reviewer.md"))
    ? join(OPENFLOW_HOME, "cache", "motion-ai", "package", "content", "agents", "motion-reviewer.md") : null;
}

async function tools(ctx) {
  step("Tools");
  if (!which("uv")) { warn("uv is required (https://docs.astral.sh/uv/). The bootstrap installs it; re-run install.sh / install.ps1."); }
  const uvTools = probe("uv", ["tool", "list"]).stdout;
  const uvi = (pkg, name, extra = []) => { if (!uvTools.includes(name)) run("uv", ["tool", "install", ...extra, pkg]); };
  uvi(`serena-agent==${V.serena}`, "serena-agent", ["-p", "3.13"]);
  uvi(`headroom-ai==${V.headroom}`, "headroom-ai");
  if (!uvTools.includes("specify-cli")) run("uv", ["tool", "install", "specify-cli", "--from", `git+https://github.com/github/spec-kit.git@${V.specify}`]);
  const npmG = probe("npm", ["ls", "-g", "--depth=0"]).stdout;
  for (const [pkg, name] of [[`codeburn@${V.codeburn}`, "codeburn@"], ["typescript-language-server", "typescript-language-server@"], ["typescript@5", "typescript@"], [`@gltf-transform/cli@${V.gltfTransform}`, "@gltf-transform/cli@"]])
    if (!npmG.includes(name)) run("npm", ["i", "-g", pkg]);
  if (!which("rtk")) {
    if (which("brew")) run("brew", ["install", "rtk"]);
    else info("rtk (bash-output compressor) skipped: needs Homebrew; optional");
  }
  // Chromium for the visual-fidelity capture tool and Playwright MCP
  run("npx", ["-y", `playwright@${V.playwright}`, "install", "chromium"]);
  await githubMcp();
  blenderAddon();
  await motionAi();
  resolveTools(ctx);
}

// GitHub MCP: official binary, verified checksum, read-only toolsets; token read from `gh auth token` at launch.
async function githubMcp() {
  const bin = join(OPENFLOW_HOME, "bin"), exe = join(bin, WIN ? "github-mcp-server.exe" : "github-mcp-server");
  if (!which("gh") || probe("gh", ["auth", "status"]).status !== 0) { info("GitHub MCP skipped: install GitHub CLI and run `gh auth login`, then re-run"); return; }
  if (!existsSync(exe) && !isDryRun()) {
    const os = WIN ? "Windows" : MAC ? "Darwin" : "Linux", a = arch() === "arm64" ? "arm64" : "x86_64";
    const asset = `github-mcp-server_${os}_${a}.${WIN ? "zip" : "tar.gz"}`;
    const base = `https://github.com/github/github-mcp-server/releases/download/${V.githubMcp}`;
    info(`→ download ${asset}`);
    try {
      const [buf, sums] = await Promise.all([fetch(`${base}/${asset}`).then((r) => r.arrayBuffer()), fetch(`${base}/github-mcp-server_${V.githubMcp.slice(1)}_checksums.txt`).then((r) => r.text())]);
      const sha = createHash("sha256").update(Buffer.from(buf)).digest("hex");
      if (!sums.includes(`${sha}  ${asset}`)) throw new Error("checksum mismatch");
      const tmp = join(tmpdir(), asset); writeFileSync(tmp, Buffer.from(buf));
      mkdirSync(bin, { recursive: true });
      run("tar", ["-xf", tmp, "-C", bin]);  // bsdtar on Windows 10+ reads zip too
      if (!WIN) chmodSync(exe, 0o755);
    } catch (e) { warn(`GitHub MCP download failed: ${e.message}`); return; }
  }
  writeText(join(bin, "github-mcp.mjs"), `#!/usr/bin/env node
// Read-only GitHub MCP (stdio). The token comes from gh's keychain at launch and is never written to config.
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const token = execSync("gh auth token", { encoding: "utf8" }).trim();
const exe = fileURLToPath(new URL("./github-mcp-server${WIN ? ".exe" : ""}", import.meta.url));
const p = spawn(exe, ["stdio", "--read-only", "--toolsets", "repos,issues,pull_requests", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: token } });
p.on("exit", (c) => process.exit(c ?? 0));
`);
}

function blenderAddon() {
  const candidates = MAC ? ["/Applications/Blender.app/Contents/MacOS/Blender"]
    : WIN ? readdirSafe("C:\\Program Files\\Blender Foundation").map((d) => `C:\\Program Files\\Blender Foundation\\${d}\\blender.exe`)
    : [which("blender")].filter(Boolean);
  const blender = candidates.find((p) => p && existsSync(p)) || which("blender");
  if (!blender) { info("Blender not found: the Blender MCP is configured but needs Blender (blender.org) to do anything"); return; }
  const addons = probe(blender, ["--background", "--python-expr", "import bpy; print('ADDONS', [a.module for a in bpy.context.preferences.addons])"]).stdout;
  if (addons.includes("blender_mcp")) return;
  run(which("uvx") || "uvx", ["mcp-for-blender", "install-addon"], { env: { DISABLE_TELEMETRY: "true" } });
  run(blender, ["--background", "--python-expr", "import bpy,addon_utils; addon_utils.enable('blender_mcp', default_set=True, persistent=True); bpy.ops.wm.save_userpref()"]);
}
const readdirSafe = (d) => { try { return readdirSync(d); } catch { return []; } };

// Motion AI Kit (official): the `motion` skill + the motion-reviewer agent, from the npm package
async function motionAi() {
  const dir = join(OPENFLOW_HOME, "cache", "motion-ai");
  if (existsSync(join(dir, "package", "content")) || isDryRun()) return;
  try {
    const buf = Buffer.from(await (await fetch(`https://registry.npmjs.org/motion-ai/-/motion-ai-${V.motionAi}.tgz`)).arrayBuffer());
    mkdirSync(dir, { recursive: true }); const tgz = join(dir, "m.tgz"); writeFileSync(tgz, buf);
    run("tar", ["-xzf", tgz, "-C", dir]);
  } catch (e) { warn(`motion-ai download failed: ${e.message}`); }
}

// ------------------------------------------------------------------------------------------------ skills
async function skills(hs, ctx) {
  step("Skills (via the `skills` CLI, into each detected harness)");
  const targets = [...new Map(hs.map((h) => [h.skillsTarget, h.skillsDir])).entries()];  // [target, dir]
  const sources = [...SKILL_SOURCES];
  const motionContent = join(OPENFLOW_HOME, "cache", "motion-ai", "package", "content");
  if (existsSync(motionContent)) sources.push([motionContent, ["motion"]]);
  for (const [src0, names] of sources) {
    const src = src0.startsWith("./") ? join(ctx.repo, src0.slice(2)) : src0;
    const need = (dir, skipClaude) => names.filter((n) => !(skipClaude && CLAUDE_VIA_PLUGIN.includes(n)) && !existsSync(join(dir, n, "SKILL.md")));
    // one call for every target that needs something; Claude separately when plugin-provided skills must be left out
    const plain = targets.filter(([t, d]) => t !== "claude-code" && need(d).length);
    const cl = targets.find(([t, d]) => t === "claude-code" && need(d, true).length);
    const common = [...new Set(plain.flatMap(([, d]) => need(d)))];
    if (plain.length && common.length) addSkills(src, plain.map(([t]) => t), common);
    if (cl) addSkills(src, ["claude-code"], need(cl[1], true));
  }
}
function addSkills(src, agents, names) {
  const r = run("npx", ["-y", V.skillsCli, "add", src, "-g", "-y", "-a", ...agents, "-s", ...names]);
  if (r.status !== 0 && !r.dry) warn(`skills add ${src} failed:\n${r.stderr.slice(-400)}`);
}
