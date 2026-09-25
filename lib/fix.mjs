// fix: find what's broken and repair it. Covers tools, Playwright browsers, the vf/forge scripts, skills, the GitHub
// MCP binary, the Blender add-on, every MCP server (live probe → targeted repair → re-probe), each harness's MCP
// config (missing entries added, broken ones replaced) and the OpenCode fleet. Anything it can't repair on its own
// is listed with the one command that does.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { V, SKILL_SOURCES, CLAUDE_VIA_PLUGIN, FLEET } from "./manifest.mjs";
import { mcpServers, probe as probeMcp, SERVER_NAMES } from "./mcp.mjs";
import { detectHarnesses } from "./harnesses.mjs";
import { resolveTools, githubMcp, blenderAddon, skills as installSkills } from "./install.mjs";
import { HOME, CONFIG, OPENFLOW_HOME, WIN, MAC, join, run, probe, which, step, info, warn, green, red, bold, isDryRun } from "./util.mjs";

const NPX_PKG = { playwright: "@playwright/mcp", "chrome-devtools": "chrome-devtools-mcp", context7: "@upstash/context7-mcp", shadcn: "shadcn", gsap: V.gsapMcp.replace(/@[^@/]+$/, "") };
const sig = (s) => (s.url ? s.url : [s.command, ...(s.args || [])].join(" "));
const rel = (p) => p.replace(HOME, "~");

export async function fix({ repo, only }) {
  const fixed = [], manual = [], ok = [];
  const hs = detectHarnesses(only);
  if (!hs.length) { warn("No supported harness found. Install OpenCode, Claude Code, Muse, Codex, Cursor or Gemini CLI first."); return 1; }
  info(`Harnesses: ${hs.map((h) => bold(h.name)).join(" · ")}`);
  const ctx = { home: OPENFLOW_HOME, repo };
  resolveTools(ctx);

  // Run a repair, then re-check. A repair that doesn't hold ends up in the manual list.
  const repair = async (what, doIt, verify, hint) => {
    info(`${bold("repair")} ${what}`);
    await doIt();
    if (isDryRun()) return fixed.push(`${what} (dry run)`);
    if (!verify || (await verify())) fixed.push(what);
    else manual.push(`${what}: still broken after repair${hint ? `. Try: ${hint}` : ""}`);
  };

  step("Prerequisites");
  for (const [t, hint] of [["git", "re-run the one-line installer"], ["npx", "install Node.js 20+"], ["uv", "re-run the one-line installer (it bootstraps uv)"], ["uvx", "re-run the one-line installer"]])
    which(t) ? ok.push(t) : manual.push(`${t} not on PATH: ${hint}`);
  const uvBin = probe("uv", ["tool", "dir", "--bin"]).stdout.trim();
  const uvExe = (n) => { const p = uvBin && join(uvBin, WIN ? `${n}.exe` : n); return (p && existsSync(p)) || !!which(n); };
  for (const [exe, pkg] of [["serena", `serena-agent==${V.serena}`], ["headroom", `headroom-ai==${V.headroom}`]]) {
    if (uvExe(exe)) { ok.push(exe); continue; }
    await repair(`${exe} missing`, () => run("uv", ["tool", "install", "--force", ...(exe === "serena" ? ["-p", "3.13"] : []), pkg]), () => uvExe(exe), `uv tool install --force ${pkg}`);
  }
  resolveTools(ctx);

  step("Browsers and vf/forge scripts");
  const pwDir = process.env.PLAYWRIGHT_BROWSERS_PATH || (MAC ? join(HOME, "Library", "Caches", "ms-playwright") : WIN ? join(process.env.LOCALAPPDATA || join(HOME, "AppData", "Local"), "ms-playwright") : join(HOME, ".cache", "ms-playwright"));
  const browsers = () => { try { return readdirSync(pwDir); } catch { return []; } };
  // vf prefers full Chromium (GPU WebGL) and falls back to the headless shell: install both
  const haveBrowsers = () => ["chromium-", "chromium_headless_shell-"].every((p) => browsers().some((d) => d.startsWith(p)));
  if (haveBrowsers()) ok.push("Playwright Chromium");
  else await repair("Playwright Chromium missing", () => run("npx", ["-y", `playwright@${V.playwright}`, "install", "chromium"]), haveBrowsers, `npx playwright@${V.playwright} install chromium`);
  const vfDir = join(HOME, ".agents", "skills", "visual-fidelity", "scripts");
  const vfDeps = () => ["playwright-core", "pngjs", "pixelmatch", "jpeg-js"].every((d) => existsSync(join(vfDir, "node_modules", d)));
  if (existsSync(vfDir) && !vfDeps()) await repair("vf script dependencies missing", () => run("npm", ["install", "--prefix", vfDir, "--no-audit", "--no-fund"]), vfDeps);
  else if (existsSync(vfDir)) ok.push("vf dependencies");

  step("Skills");
  const want = SKILL_SOURCES.flatMap(([, names]) => names);
  const local = SKILL_SOURCES.filter(([src]) => src.startsWith("./")).flatMap(([src, names]) => names.map((n) => [join(repo, src.slice(2)), n]));
  const drift = (dir) => local.filter(([src, n]) => {
    const a = join(src, n), b = join(dir, n);
    const files = (d, p = "") => { try { return readdirSync(join(d, p), { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" ? [] : e.isDirectory() ? files(d, join(p, e.name)) : [join(p, e.name)])); } catch { return []; } };
    return files(a).some((f) => !existsSync(join(b, f)) || !readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
  }).map(([, n]) => n);
  const skillProblems = [];
  for (const dir of new Set(hs.map((h) => h.skillsDir))) {
    const h = hs.find((x) => x.skillsDir === dir);
    const miss = want.filter((s) => !(h.skillsTarget === "claude-code" && CLAUDE_VIA_PLUGIN.includes(s)) && !existsSync(join(dir, s, "SKILL.md")));
    const old = drift(dir).filter((n) => !miss.includes(n));
    if (miss.length || old.length) skillProblems.push(`${rel(dir)}: ${miss.length ? `missing ${miss.slice(0, 6).join(", ")}${miss.length > 6 ? ` +${miss.length - 6}` : ""}` : ""}${miss.length && old.length ? "; " : ""}${old.length ? `outdated ${old.join(", ")}` : ""}`);
  }
  if (!skillProblems.length) ok.push("skills");
  else { skillProblems.forEach((p) => warn(p)); await repair(`skills (${skillProblems.length} dir${skillProblems.length > 1 ? "s" : ""})`, () => installSkills(hs, ctx)); }

  step("GitHub MCP binary and Blender add-on");
  const ghExe = join(OPENFLOW_HOME, "bin", WIN ? "github-mcp-server.exe" : "github-mcp-server"), ghWrap = join(OPENFLOW_HOME, "bin", "github-mcp.mjs");
  if (!which("gh")) manual.push("GitHub MCP: install GitHub CLI (https://cli.github.com), run `gh auth login`, then `openflow fix`");
  else if (probe("gh", ["auth", "status"]).status !== 0) manual.push("GitHub MCP: run `gh auth login` (the token is read from gh at launch, never stored), then `openflow fix`");
  else if (!existsSync(ghExe) || !existsSync(ghWrap)) await repair("GitHub MCP binary/wrapper missing", githubMcp, () => existsSync(ghExe) && existsSync(ghWrap));
  else ok.push("GitHub MCP binary");
  blenderAddon();  // no-op when the add-on is enabled or Blender isn't installed
  resolveTools(ctx);

  step("MCP servers: live probe");
  let defs = mcpServers(ctx, { http: true });
  const probeAll = async (list) => Object.fromEntries(await Promise.all(list.map(async (d) => [d.name, await probeMcp(d, { cwd: tmpdir() })])));
  let live = await probeAll(defs);
  for (const d of defs) {
    if (live[d.name].tools) { ok.push(`${d.name} (${live[d.name].tools.length} tools)`); continue; }
    warn(`${d.name}: ${live[d.name].error}`);
    const reprobe = async () => { const r = await probeMcp(d, { cwd: tmpdir(), timeoutMs: 180000 }); live[d.name] = r; return !!r.tools; };
    if (NPX_PKG[d.name]) {
      if (d.name === "chrome-devtools" && !chromeInstalled()) { manual.push("chrome-devtools MCP needs Google Chrome: install it from google.com/chrome"); continue; }
      await repair(`${d.name}: clear its npx cache and re-download`, () => clearNpx(NPX_PKG[d.name]), reprobe, `npx -y ${d.args.find((a) => a.includes(NPX_PKG[d.name]))}`);
    } else if (d.name === "blender") {
      await repair("blender: refresh mcp-for-blender", () => run("uv", ["cache", "clean", "mcp-for-blender"]), reprobe, "uvx mcp-for-blender");
    } else if (d.name === "serena" || d.name === "headroom") {
      const pkg = d.name === "serena" ? `serena-agent==${V.serena}` : `headroom-ai==${V.headroom}`;
      await repair(`${d.name}: reinstall`, () => run("uv", ["tool", "install", "--force", "--reinstall", ...(d.name === "serena" ? ["-p", "3.13"] : []), pkg]), reprobe);
    } else if (d.name === "github") {
      await repair("github: re-download the server binary", async () => { if (!isDryRun()) rmSync(ghExe, { force: true }); await githubMcp(); }, reprobe, "gh auth status");
    } else if (d.url) {
      manual.push(`${d.name}: ${d.url} is unreachable (${live[d.name].error}). Check the network or proxy; nothing local to repair`);
    }
  }
  for (const s of SERVER_NAMES) if (!defs.find((d) => d.name === s)) manual.push(`${s}: prerequisite missing (see above), so it can't be configured yet`);

  step("MCP servers: per-harness config");
  const entryProbes = new Map();  // signature → probe result, so one broken command is probed once across harnesses
  for (const h of hs) {
    const want = mcpServers(ctx, h.mcpOpts), have = h.mcpEntries ? h.mcpEntries() : Object.fromEntries(h.mcpNames().map((n) => [n, null]));
    const missing = want.filter((d) => !(d.name in have)), replace = new Set();
    for (const d of want) {
      const e = have[d.name];
      if (!e || sig(e) === sig(d)) continue;          // absent (added below) or exactly ours (probed above)
      if (e.disabled) { info(`${h.name}: ${d.name} is disabled in your config; left alone`); continue; }
      if (e.command && /[\\/]/.test(e.command) && !existsSync(e.command)) { warn(`${h.name}: ${d.name} → ${rel(e.command)} does not exist`); replace.add(d.name); continue; }
      const k = sig(e);
      if (!entryProbes.has(k)) entryProbes.set(k, await probeMcp(e, { cwd: tmpdir() }));
      if (!entryProbes.get(k).tools && live[d.name]?.tools) { warn(`${h.name}: ${d.name} entry fails (${entryProbes.get(k).error}); OpenFlow's definition works`); replace.add(d.name); }
    }
    if (!missing.length && !replace.size) { ok.push(`${h.name} MCP config`); continue; }
    const what = [missing.length && `add ${missing.map((d) => d.name).join(", ")}`, replace.size && `replace broken ${[...replace].join(", ")}`].filter(Boolean).join("; ");
    await repair(`${h.name}: ${what}`, () => h.addMcp(want, replace), () => { const now = h.mcpEntries ? h.mcpEntries() : {}; return want.every((d) => d.name in now || !h.mcpEntries); });
  }

  const oc = hs.find((h) => h.id === "opencode");
  if (oc) {
    step("OpenCode fleet");
    const differs = ["agents", "commands"].flatMap((kind) => readdirSync(join(repo, kind, "opencode")).filter((f) => {
      const dst = join(CONFIG, "opencode", kind, f);
      return !existsSync(dst) || readFileSync(dst, "utf8") !== readFileSync(join(repo, kind, "opencode", f), "utf8");
    }).map((f) => `${kind}/${f}`));
    if (!differs.length) ok.push(`fleet (${FLEET.length} agents)`);
    else await repair(`fleet: ${differs.length} file(s) missing or outdated (${differs.slice(0, 4).join(", ")}${differs.length > 4 ? "…" : ""})`, () => oc.installAgents(repo));
  }

  step("Summary");
  info(`${green("OK")}      ${ok.join(" · ")}`);
  fixed.forEach((f) => info(`${green("FIXED")}   ${f}`));
  manual.forEach((m) => info(`${red("MANUAL")}  ${m}`));
  if (!fixed.length && !manual.length) info("Nothing to fix.");
  if (fixed.length) info(`Restart open harness sessions so they reload their MCP config, then run ${bold("openflow doctor")} to confirm.`);
  return manual.length ? 1 : 0;
}

function chromeInstalled() {
  if (MAC) return existsSync("/Applications/Google Chrome.app") || existsSync(join(HOME, "Applications", "Google Chrome.app"));
  if (WIN) return [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).some((d) => existsSync(join(d, "Google", "Chrome", "Application", "chrome.exe")));
  return !!(which("google-chrome") || which("google-chrome-stable") || which("chromium"));
}

// npx keeps each package in <npm cache>/_npx/<hash>/. A half-downloaded or corrupted copy there makes every launch
// fail the same way, so remove the copies of this package and let the next launch fetch it again.
function clearNpx(pkg) {
  const root = join(probe("npm", ["config", "get", "cache"]).stdout.trim() || join(HOME, ".npm"), "_npx");
  let n = 0;
  for (const d of (() => { try { return readdirSync(root); } catch { return []; } })()) {
    const pj = join(root, d, "package.json");
    try { if (!Object.keys(JSON.parse(readFileSync(pj, "utf8")).dependencies || {}).includes(pkg)) continue; } catch { continue; }
    if (!isDryRun()) rmSync(join(root, d), { recursive: true, force: true });
    n++;
  }
  info(`cleared ${n} cached cop${n === 1 ? "y" : "ies"} of ${pkg}`);
}
