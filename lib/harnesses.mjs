// Harness adapters. Each one knows how to detect itself, where its skills live (as a `skills` CLI target),
// how to read/write its MCP config, its plugins, and (OpenCode only, so far) the agent fleet.
// To support another harness, add an adapter here: detect() + skillsTarget + mcpNames() + addMcp().
import { readdirSync, readFileSync } from "node:fs";
import { CONFIG, HOME, exists, join, readJson, writeJson, writeText, run, probe, which, info, warn } from "./util.mjs";
import { CLAUDE_MARKETPLACES, CLAUDE_PLUGINS, OPENCODE_PLUGINS, FLEET } from "./manifest.mjs";

const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
const CODEX_HOME = process.env.CODEX_HOME || join(HOME, ".codex");

// ---------------------------------------------------------------------------------------------- OpenCode
const ocPath = () => [join(CONFIG, "opencode", "opencode.json"), join(CONFIG, "opencode", "opencode.jsonc")].find(exists) || join(CONFIG, "opencode", "opencode.json");
const opencode = {
  id: "opencode", name: "OpenCode", skillsTarget: "universal", skillsDir: join(HOME, ".agents", "skills"),
  mcpOpts: { serenaContext: "ide", http: true },
  detect: () => !!which("opencode") || exists(join(CONFIG, "opencode")),
  mcpNames: () => Object.keys(readJson(ocPath(), {})?.mcp || {}),
  addMcp(servers) {
    const p = ocPath(), c = readJson(p, {}) ?? {};
    if (c === null) return warn(`${p} is not valid JSON; skipped`);
    c.$schema ??= "https://opencode.ai/config.json";
    const m = (c.mcp ??= {}); let n = 0;
    for (const s of servers) {
      if (m[s.name]) continue;
      m[s.name] = s.url ? { type: "remote", url: s.url } : { type: "local", command: [s.command, ...s.args], ...(s.env ? { environment: s.env } : {}) };
      n++;
    }
    const plugins = (c.plugin ??= []);
    for (const pl of OPENCODE_PLUGINS) if (!plugins.includes(pl)) { plugins.push(pl); n++; }
    if (n) writeJson(p, c);
    info(`OpenCode: ${n} MCP/plugin entr${n === 1 ? "y" : "ies"} added (${p})`);
  },
  plugins() {
    if (which("rtk") && !exists(join(CONFIG, "opencode", "plugins", "rtk.ts"))) run("rtk", ["init", "-g", "--opencode", "--no-trust-filters"]);
  },
  // The fleet: 9 agents + 2 commands. Existing files that differ are backed up, then replaced.
  installAgents(repo) {
    let n = 0;
    for (const kind of ["agents", "commands"]) {
      const src = join(repo, kind, "opencode"), dst = join(CONFIG, "opencode", kind);
      for (const f of readdirSync(src)) {
        const a = readFileSync(join(src, f), "utf8"), bp = join(dst, f);
        if (exists(bp) && readFileSync(bp, "utf8") === a) continue;
        writeText(bp, a); n++;
      }
    }
    info(`OpenCode fleet: ${n} file(s) written to ${join(CONFIG, "opencode")}/{agents,commands}`);
  },
  agentsDir: join(CONFIG, "opencode", "agents"),
};

// ---------------------------------------------------------------------------------------------- Claude Code
const claude = {
  id: "claude", name: "Claude Code", skillsTarget: "claude-code", skillsDir: join(CLAUDE_HOME, "skills"),
  mcpOpts: { serenaContext: "claude-code", http: true },
  detect: () => !!which("claude"),
  mcpNames() {
    const cfg = readJson(join(HOME, ".claude.json"), {}) || {};
    return Object.keys(cfg.mcpServers || {});
  },
  addMcp(servers) {
    const have = new Set(this.mcpNames()); let n = 0;
    for (const s of servers) {
      if (have.has(s.name)) continue;
      const args = s.url ? ["mcp", "add", "-s", "user", "--transport", "http", s.name, s.url]
        : ["mcp", "add", "-s", "user", ...Object.entries(s.env || {}).flatMap(([k, v]) => ["-e", `${k}=${v}`]), s.name, "--", s.command, ...s.args];
      if (run("claude", args).status === 0) n++;
    }
    info(`Claude Code: ${n} MCP server(s) added (user scope)`);
  },
  plugins(ctx) {
    const mk = probe("claude", ["plugin", "marketplace", "list"]).stdout;
    for (const [name, src] of CLAUDE_MARKETPLACES) if (!mk.includes(name)) run("claude", ["plugin", "marketplace", "add", src]);
    const enabled = readJson(join(CLAUDE_HOME, "settings.json"), {})?.enabledPlugins || {};
    for (const p of CLAUDE_PLUGINS) if (!enabled[p]) run("claude", ["plugin", "install", p, "--scope", "user"]);
    const mr = join(CLAUDE_HOME, "agents", "motion-reviewer.md");
    if (ctx.motionReviewer && !exists(mr)) writeText(mr, readFileSync(ctx.motionReviewer, "utf8"));
    if (which("rtk") && !/\[ok\] Hook/.test(probe("rtk", ["init", "-g", "--show"]).stdout)) run("rtk", ["init", "-g", "--hook-only", "--auto-patch", "--no-trust-filters"]);
  },
};

// ---------------------------------------------------------------------------------------------- Muse Code
const musePath = join(CONFIG, "muse", "settings.json");
const muse = {
  id: "muse", name: "Muse Code", skillsTarget: "universal", skillsDir: join(HOME, ".agents", "skills"),
  mcpOpts: { serenaContext: "ide", http: false },
  detect: () => !!which("muse") || exists(musePath),
  mcpNames: () => Object.keys(readJson(musePath, {})?.mcpServers || {}),
  addMcp(servers) {
    const c = readJson(musePath, {}) ?? {};
    const m = (c.mcpServers ??= {}); let n = 0;
    for (const s of servers) {
      if (m[s.name]) continue;
      m[s.name] = { mode: "optional", transport: "stdio", command: s.command, args: s.args, ...(s.env ? { env: s.env } : {}) };
      n++;
    }
    if (n) writeJson(musePath, c);
    info(`Muse: ${n} MCP server(s) added (${musePath})`);
  },
  plugins(ctx) {
    if (probe("muse", ["plugins", "list"]).stdout.includes("superpowers")) return;
    const sp = join(ctx.home, "plugins", "superpowers");
    if (!exists(sp)) run("git", ["clone", "--depth", "1", "https://github.com/obra/superpowers.git", sp]);
    run("muse", ["plugins", "install", sp]); run("muse", ["plugins", "approve", "superpowers"]);
  },
};

// ---------------------------------------------------------------------------------------------- Codex CLI
const codexToml = join(CODEX_HOME, "config.toml");
const tomlStr = (s) => JSON.stringify(String(s));
const codex = {
  id: "codex", name: "Codex CLI", skillsTarget: "codex", skillsDir: join(HOME, ".agents", "skills"),  // the skills CLI installs Codex skills to the shared dir, which Codex reads
  mcpOpts: { serenaContext: "codex", http: false },
  detect: () => !!which("codex") || exists(CODEX_HOME),
  mcpNames() {
    const t = exists(codexToml) ? readFileSync(codexToml, "utf8") : "";
    return [...t.matchAll(/^\[mcp_servers\.(?:"([^"]+)"|([\w-]+))\]/gm)].map((m) => m[1] || m[2]);
  },
  addMcp(servers) {
    const have = new Set(this.mcpNames()); let add = "";
    for (const s of servers) {
      if (have.has(s.name)) continue;
      add += `\n[mcp_servers.${tomlStr(s.name)}]\ncommand = ${tomlStr(s.command)}\nargs = [${s.args.map(tomlStr).join(", ")}]\n`;
      if (s.env) add += `env = { ${Object.entries(s.env).map(([k, v]) => `${tomlStr(k)} = ${tomlStr(v)}`).join(", ")} }\n`;
    }
    if (add) writeText(codexToml, (exists(codexToml) ? readFileSync(codexToml, "utf8").replace(/\s*$/, "\n") : "") + add);
    info(`Codex: ${add ? add.match(/\[mcp_servers/g).length : 0} MCP server(s) added (${codexToml})`);
  },
};

// ---------------------------------------------------------------------------------------------- Cursor, Gemini CLI
const jsonMcp = (id, name, file, skillsTarget, skillsDir, urlKey, detect) => ({
  id, name, skillsTarget, skillsDir, mcpOpts: { serenaContext: "ide", http: true }, detect,
  mcpNames: () => Object.keys(readJson(file, {})?.mcpServers || {}),
  addMcp(servers) {
    const c = readJson(file, {}) ?? {};
    const m = (c.mcpServers ??= {}); let n = 0;
    for (const s of servers) {
      if (m[s.name]) continue;
      m[s.name] = s.url ? { [urlKey]: s.url } : { command: s.command, args: s.args, ...(s.env ? { env: s.env } : {}) };
      n++;
    }
    if (n) writeJson(file, c);
    info(`${name}: ${n} MCP server(s) added (${file})`);
  },
});
const cursor = jsonMcp("cursor", "Cursor", join(HOME, ".cursor", "mcp.json"), "cursor", join(HOME, ".cursor", "skills"), "url",
  () => exists(join(HOME, ".cursor")) || !!which("cursor-agent"));
const gemini = jsonMcp("gemini", "Gemini CLI", join(HOME, ".gemini", "settings.json"), "gemini-cli", join(HOME, ".gemini", "skills"), "httpUrl",
  () => !!which("gemini"));

export const HARNESSES = [opencode, claude, muse, codex, cursor, gemini];
export function detectHarnesses(only) {
  const want = only ? new Set(only.split(",").map((s) => s.trim())) : null;
  return HARNESSES.filter((h) => (want ? want.has(h.id) : true) && h.detect());
}
export { FLEET };
