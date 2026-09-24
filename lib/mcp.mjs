// The 10 MCP servers, built for the current OS, plus a live probe (initialize + tools/list).
import { spawn } from "node:child_process";
import { V } from "./manifest.mjs";
import { WIN } from "./util.mjs";

const npx = (...a) => (WIN ? { command: "cmd", args: ["/c", "npx", "-y", ...a] } : { command: "npx", args: ["-y", ...a] });

/**
 * ctx: { uvx, headroom, serena, githubWrapper } absolute paths (null = unavailable)
 * opts: { serenaContext, http: whether the harness speaks streamable HTTP natively }
 * Returns [{ name, command, args, env } | { name, url }]
 */
export function mcpServers(ctx, { serenaContext = "ide", http = true } = {}) {
  const s = [
    { name: "playwright", ...npx("@playwright/mcp@latest") },
    { name: "chrome-devtools", ...npx("chrome-devtools-mcp@latest", "--isolated") },
    { name: "context7", ...npx("@upstash/context7-mcp") },
    { name: "shadcn", ...npx(V.shadcn, "mcp") },
    { name: "gsap", ...npx(V.gsapMcp) },
    http ? { name: "motion", url: "https://mcp.motion.dev" } : { name: "motion", ...npx(V.mcpRemote, "https://mcp.motion.dev") },
  ];
  if (ctx.uvx) s.push({ name: "blender", command: ctx.uvx, args: ["mcp-for-blender"], env: { DISABLE_TELEMETRY: "true" } });
  if (ctx.headroom) s.push({ name: "headroom", command: ctx.headroom, args: ["mcp", "serve"] });
  if (ctx.serena) s.push({ name: "serena", command: ctx.serena, args: ["start-mcp-server", "--project-from-cwd", "--open-web-dashboard", "False", "--context", serenaContext] });
  if (ctx.githubWrapper) s.push({ name: "github", command: "node", args: [ctx.githubWrapper] });
  return s;
}
export const SERVER_NAMES = ["playwright", "chrome-devtools", "context7", "github", "blender", "headroom", "serena", "motion", "shadcn", "gsap"];

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "openflow", version: "1" } } };

/** Start a server, list its tools. Resolves { tools: [...names], schema: {name: inputSchema} } or { error }. */
export function probe(server, { cwd, timeoutMs = 90000 } = {}) {
  return server.url ? probeHttp(server.url).then((r) => (r.error ? probeHttp(server.url) : r)) : probeStdio(server, cwd, timeoutMs);  // one retry for hosted servers
}
function probeStdio({ command, args = [], env }, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let p;
    try { p = spawn(command, args, { cwd, env: { ...process.env, ...(env || {}) }, stdio: ["pipe", "pipe", "ignore"], shell: false }); }
    catch (e) { return resolve({ error: e.message }); }
    let buf = "", done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(t); try { p.kill(); } catch {} resolve(r); };
    const t = setTimeout(() => finish({ error: `no answer in ${timeoutMs / 1000}s` }), timeoutMs);
    p.on("error", (e) => finish({ error: e.message }));
    p.on("exit", (c) => finish({ error: `exited ${c}` }));
    p.stdout.on("data", (d) => {
      buf += d; let i;
      while ((i = buf.indexOf("\n")) > -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) {
          p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        } else if (m.id === 2) {
          finish(m.error ? { error: m.error.message } : { tools: m.result.tools.map((x) => x.name), schema: Object.fromEntries(m.result.tools.map((x) => [x.name, x.inputSchema || {}])) });
        }
      }
    });
    p.stdin.write(JSON.stringify(INIT) + "\n");
  });
}
async function probeHttp(url) {
  const post = async (body, sid) => {
    const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(30000), body: JSON.stringify(body),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sid ? { "mcp-session-id": sid } : {}) } });
    const text = await r.text();
    const json = text.trim().startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() || "{}");
    return { json, sid: r.headers.get("mcp-session-id") || sid };
  };
  try {
    const a = await post(INIT);
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, a.sid).catch(() => {});
    const b = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, a.sid);
    return { tools: b.json.result.tools.map((x) => x.name), schema: Object.fromEntries(b.json.result.tools.map((x) => [x.name, x.inputSchema || {}])) };
  } catch (e) { return { error: e.message }; }
}
