#!/usr/bin/env node
// OpenFlow: skills, MCP servers, plugins and a frontend agent fleet for coding-agent harnesses.
//   node openflow.mjs install [--only opencode,claude] [--skip tools,skills,mcp,plugins,agents] [--dry-run]
//   node openflow.mjs doctor  [--only ...] [--live]
//   node openflow.mjs fix     [--only ...] [--dry-run]   (detect what is broken and repair it)
//   node openflow.mjs list
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { install } from "./lib/install.mjs";
import { doctor } from "./lib/doctor.mjs";
import { fix } from "./lib/fix.mjs";
import { HARNESSES } from "./lib/harnesses.mjs";
import { setDryRun, bold, dim } from "./lib/util.mjs";

const repo = dirname(fileURLToPath(import.meta.url));
const [cmd = "help", ...rest] = process.argv.slice(2);
const flag = (f) => rest.includes(f);
const opt = (f) => { const i = rest.indexOf(f); return i > -1 ? rest[i + 1] : undefined; };

const major = +process.versions.node.split(".")[0];
if (major < 20) { console.error(`OpenFlow needs Node.js 20+ (found ${process.versions.node}).`); process.exit(1); }

if (cmd === "install") {
  setDryRun(flag("--dry-run"));
  process.exit(await install({ repo, only: opt("--only"), skip: new Set((opt("--skip") || "").split(",").filter(Boolean)) }));
} else if (cmd === "doctor") {
  process.exit(await doctor({ repo, only: opt("--only"), live: flag("--live") }));
} else if (cmd === "fix") {
  setDryRun(flag("--dry-run"));
  process.exit(await fix({ repo, only: opt("--only") }));
} else if (cmd === "list") {
  for (const h of HARNESSES) console.log(`${h.detect() ? "✓" : "·"} ${h.name.padEnd(12)} ${dim(h.id)}`);
} else {
  console.log(`${bold("openflow")} install | doctor | fix | list
  install  --only opencode,claude,muse,codex,cursor,gemini   --skip tools,skills,mcp,plugins,agents   --dry-run
  doctor   --only …   --live (OpenCode: summon every specialist and verify delegation)
  fix      --only …   --dry-run   (probe tools, browsers, skills, every MCP server and each harness's config; repair what's broken)`);
}
