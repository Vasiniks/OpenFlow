// doctor: read-only check of every detected harness + the OpenCode fleet. Exit 1 on any FAIL.
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { SKILL_SOURCES, CLAUDE_VIA_PLUGIN, FLEET } from "./manifest.mjs";
import { mcpServers, probe as probeMcp, SERVER_NAMES } from "./mcp.mjs";
import { detectHarnesses } from "./harnesses.mjs";
import { HOME, CONFIG, OPENFLOW_HOME, WIN, join, probe, probeToFile, which, step, green, yellow, red } from "./util.mjs";

// Who may consult whom (acyclic; only `frontend` reaches the writer `general`)
const EXPECTED_TASKS = {
  frontend: ["reference-analyst", "art-director", "frontend-architect", "interaction-designer", "motion-designer", "threejs-art-director", "responsive-specialist", "visual-critic", "asset-producer", "builder", "explore"],
  "art-director": ["threejs-art-director", "motion-designer", "reference-analyst"],
  "interaction-designer": ["motion-designer", "reference-analyst"],
  "responsive-specialist": ["visual-critic", "reference-analyst"],
  "frontend-architect": ["explore"],
  "motion-designer": ["reference-analyst"], "threejs-art-director": ["reference-analyst"], "visual-critic": ["reference-analyst"],
  "reference-analyst": [],
  "asset-producer": [],
  "builder": [],
};
const LIVE_PAIRS = { "builder": null, "asset-producer": null, "art-director": "threejs-art-director", "interaction-designer": "motion-designer", "responsive-specialist": "visual-critic",
  "frontend-architect": "explore", "motion-designer": "reference-analyst", "threejs-art-director": "reference-analyst", "visual-critic": "reference-analyst", "reference-analyst": null };

const n = { PASS: 0, WARN: 0, FAIL: 0 };
const say = (lvl, msg) => { n[lvl]++; console.log(`  ${{ PASS: green, WARN: yellow, FAIL: red }[lvl](lvl.padEnd(4))}  ${msg}`); };
const check = (ok, msg, bad = "FAIL") => say(ok ? "PASS" : bad, msg);
const front = (md) => { const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/); return m ? [m[1], m[2]] : ["", md]; };
const disabledTools = (fm) => { const b = fm.match(/^tools:\r?\n((?:[ \t]+.*\r?\n?)*)/m); return b ? [...b[1].matchAll(/^\s+"([^"]+)":\s*false\s*$/gm)].map((m) => m[1]) : []; };
const glob = (pat) => new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

export async function doctor({ repo, only, live }) {
  step("Harnesses");
  const hs = detectHarnesses(only);
  check(hs.length > 0, hs.length ? hs.map((h) => h.name).join(" · ") : "none detected");

  step("Tools");
  for (const t of ["node", "npx", "git", "uv", "uvx"]) check(!!which(t), t);
  for (const t of ["gh", "serena", "headroom"]) check(!!which(t) || existsSync(join(probe("uv", ["tool", "dir", "--bin"]).stdout.trim(), WIN ? `${t}.exe` : t)), t, "WARN");

  // one live probe per server definition (the same command every harness launches)
  const ctx = {};
  { const bin = probe("uv", ["tool", "dir", "--bin"]).stdout.trim(); const exe = (x) => { const p = bin && join(bin, WIN ? `${x}.exe` : x); return p && existsSync(p) ? p : which(x); };
    ctx.uvx = which("uvx"); ctx.serena = exe("serena"); ctx.headroom = exe("headroom");
    const gw = join(OPENFLOW_HOME, "bin", "github-mcp.mjs"); ctx.githubWrapper = existsSync(gw) ? gw : null; }
  const defs = mcpServers(ctx, { http: true });
  step(`MCP servers: live probe (${defs.length})`);
  const live_ = Object.fromEntries(await Promise.all(defs.map(async (d) => [d.name, await probeMcp(d, { cwd: tmpdir() })])));
  for (const d of defs) check(!!live_[d.name].tools, `${d.name}: ${live_[d.name].tools ? live_[d.name].tools.length + " tools" : live_[d.name].error}`);
  for (const s of SERVER_NAMES) if (!defs.find((d) => d.name === s)) say("WARN", `${s}: prerequisite missing (see install output)`);

  step("MCP servers: configured per harness");
  for (const h of hs) {
    const have = new Set(h.mcpNames()), missing = defs.map((d) => d.name).filter((x) => !have.has(x));
    check(!missing.length, `${h.name}: ${defs.length - missing.length}/${defs.length}` + (missing.length ? ` | missing: ${missing.join(", ")}` : ""));
  }

  step("Skills per harness");
  const want = SKILL_SOURCES.flatMap(([, names]) => names).concat(existsSync(join(OPENFLOW_HOME, "cache", "motion-ai")) ? ["motion"] : []);
  const seen = new Set();
  for (const h of hs) {
    if (seen.has(h.skillsDir)) continue; seen.add(h.skillsDir);
    const need = want.filter((s) => !(h.skillsTarget === "claude-code" && CLAUDE_VIA_PLUGIN.includes(s)));
    const miss = need.filter((s) => !existsSync(join(h.skillsDir, s, "SKILL.md")));
    check(!miss.length, `${h.skillsDir.replace(HOME, "~")}: ${need.length - miss.length}/${need.length}` + (miss.length ? ` | missing: ${miss.slice(0, 10).join(", ")}` : ""));
  }

  if (hs.find((h) => h.id === "opencode")) await fleet(repo, live_, live);
  console.log(`\n${n.PASS} passed, ${n.WARN} warnings, ${n.FAIL} failed`);
  return n.FAIL ? 1 : 0;
}

async function fleet(repo, live_, live) {
  step("OpenCode fleet");
  const tools = Object.fromEntries(Object.entries(live_).flatMap(([s, r]) => (r.tools || []).map((t) => [`${s}_${t}`, r.schema[t] || {}])));
  const skillNames = new Set(JSON.parse(probeToFile("opencode", ["debug", "skill"]) || "[]").map((s) => s.name));
  const MCP_RE = new RegExp(`\\b((?:${Object.keys(live_).map((s) => s.replace(/-/g, "\\-")).join("|")})_[A-Za-z0-9_-]+)(\\(\\{)?`, "g");
  const graph = {};
  for (const a of FLEET) {
    const path = join(CONFIG, "opencode", "agents", `${a}.md`);
    if (!existsSync(path)) { say("FAIL", `${a}: not installed`); continue; }
    const md = readFileSync(path, "utf8"), [fm, body] = front(md), p = [];
    if (md !== readFileSync(join(repo, "agents", "opencode", `${a}.md`), "utf8")) p.push("differs from repo (run install)");
    let dbg = {}; try { dbg = JSON.parse(probeToFile("opencode", ["debug", "agent", a])); } catch { p.push("`opencode debug agent` failed"); }
    const allowed = (dbg.permission || []).filter((x) => x.permission === "task" && x.action === "allow" && x.pattern !== "*").map((x) => x.pattern).sort();
    graph[a] = allowed;
    if (allowed.join() !== [...EXPECTED_TASKS[a]].sort().join()) p.push(`task allow-list: ${allowed.join(",") || "none"}`);
    if (!["frontend", "asset-producer", "builder"].includes(a) && dbg.tools?.edit !== false) p.push("edit not denied");
    if (a === "asset-producer") { const ed = (dbg.permission || []).filter((x) => x.permission === "edit"); if (!ed.some((x) => x.pattern === "*" && x.action === "deny")) p.push("asset-producer edit not scoped"); }
    const skills = [...body.matchAll(/skill\(\{\s*name:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
    const missing = [...new Set(skills)].filter((s) => !skillNames.has(s));
    const off = disabledTools(fm).map(glob), bad = [];
    for (const m of body.matchAll(MCP_RE)) {
      const name = m[1]; if (name.endsWith("_")) continue;
      if (!tools[name]) { bad.push(`${name}: no such tool`); continue; }
      if (off.some((r) => r.test(name))) bad.push(`${name}: disabled for this agent`);
    }
    check(!p.length && !missing.length && !bad.length, `${a}: ${new Set(skills).size} skills, consults ${allowed.join(", ") || "— (leaf)"}`
      + (p.length ? ` | ${p.join("; ")}` : "") + (missing.length ? ` | skills missing: ${missing.join(", ")}` : "") + (bad.length ? ` | ${bad.slice(0, 4).join("; ")}` : ""));
  }
  const reach = (x, seen = []) => (seen.includes(x) ? ["CYCLE"] : (graph[x] || []).flatMap((c) => [c, ...reach(c, [...seen, x])]));
  const cyc = FLEET.filter((a) => a !== "frontend" && reach(a).includes("CYCLE")), leak = FLEET.filter((a) => a !== "frontend" && ["general", "builder", "asset-producer"].some((w) => reach(a).includes(w)));
  check(!cyc.length && !leak.length, `delegation graph acyclic=${!cyc.length}, only frontend reaches the writers (builder, asset-producer)=${!leak.length}`);
  check(existsSync(join(HOME, ".agents", "skills", "asset-forge", "scripts", "forge")), "asset-forge `forge` tool present");
  const vf = join(HOME, ".agents", "skills", "visual-fidelity", "scripts");
  check(existsSync(join(vf, "vf")), "visual-fidelity `vf` tool present");
  if (live) await liveTest();
}

// frontend summons each specialist; each consults its consultant. Ground truth = OpenCode's session tree.
async function liveTest() {
  step("Live: frontend → specialists → consultants (5–10 min)");
  const dir = join(OPENFLOW_HOME, "live-check"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const pairs = Object.entries(LIVE_PAIRS).map(([a, c]) => `${a}:${c || "none"}`).join(", ");
  probe("opencode", ["run", "--agent", "frontend", `FLEET SELF-CHECK. Do not do design work or create .design/ files. For EACH agent:child pair in order: ${pairs}. Call the task tool with subagent_type=<agent> and this prompt, substituting <child>: 'SELF-CHECK ONLY. Ignore your Method and Output sections. Step 1: load the first skill in your Calls table. Step 2: if <child> is not none, call the task tool with subagent_type <child> and prompt: "SELF-CHECK ONLY. If you can call reference-analyst, call it with prompt Reply exactly PONG. Then reply PONG." Step 3: reply with exactly: TOOLS: <every tool you can call, comma-separated> / SKILL: <skill loaded> / CHILD: <reply or none>.' Write each reply verbatim to ./<agent>.txt. When all 8 files exist, reply DONE.`], { cwd: dir, timeout: 1800000 });
  let sqlite; try { sqlite = await import("node:sqlite"); } catch { say("WARN", "node:sqlite unavailable (Node ≥22.13 needed): delegation tree not verified"); return; }
  const tmp = join(tmpdir(), `oc-${Date.now()}.db`); copyFileSync(join(HOME, ".local", "share", "opencode", "opencode.db"), tmp);
  const db = new sqlite.DatabaseSync(tmp, { readOnly: true });
  const root = db.prepare("select id from session where directory = ? and parent_id is null order by time_created desc limit 1").get(dir);
  const rows = root ? db.prepare(`with recursive t(id, agent, parent, depth) as (select id, agent, null, 0 from session where id = ?
      union all select s.id, s.agent, t.agent, t.depth + 1 from session s join t on s.parent_id = t.id) select parent, agent, depth from t`).all(root.id) : [];
  db.close(); rmSync(tmp, { force: true });
  const has = (p, c, d) => rows.some((r) => r.parent === p && r.agent === c && r.depth === d);
  for (const [a, c] of Object.entries(LIVE_PAIRS)) {
    const ok = has("frontend", a, 1) && (c ? has(a, c, 2) && (!["threejs-art-director", "motion-designer", "visual-critic"].includes(c) || has(c, "reference-analyst", 3)) : !rows.some((r) => r.parent === a));
    check(ok, `${a}: ${c ? `consulted ${c}` : "leaf, no delegation"}`);
  }
  check(!rows.some((r) => ["general", "builder", "asset-producer"].includes(r.agent) && r.parent !== "frontend"), `session tree: ${rows.length - 1} delegations, no specialist reached a writer`);
}
