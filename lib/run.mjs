// run: a long one-shot OpenCode run that survives network drops.
// `opencode run` exits when a model call fails ("Cannot connect to API"), which on a laptop happens whenever it
// sleeps or changes network. The orchestrator resumes from .design/ (STEP 0), so relaunching the same command in
// the same folder continues where it stopped. macOS: wrapped in `caffeinate -i` so idle sleep doesn't cut it.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { MAC, WIN, which, info, warn, bold } from "./util.mjs";

const NETWORK = /Cannot connect to API|Unable to connect|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|network error/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const online = () => fetch("https://opencode.ai", { method: "HEAD", signal: AbortSignal.timeout(10000) }).then(() => true, () => false);

export async function runResilient({ agent = "frontend", command, args = [], log, retries = 6 }) {
  if (!which("opencode")) { warn("opencode not found on PATH"); return 1; }
  const oc = ["run", "--agent", agent, ...(command ? ["--command", command] : []), ...args];
  const [cmd, argv] = MAC && which("caffeinate") ? ["caffeinate", ["-i", "opencode", ...oc]] : ["opencode", oc];
  const out = (s) => { process.stdout.write(s); if (log) appendFileSync(log, s); };
  for (let attempt = 1; attempt <= retries; attempt++) {
    out(`\n=== openflow run: attempt ${attempt} ${new Date().toISOString()}\n`);
    let tail = "";
    const code = await new Promise((resolve) => {
      const p = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], shell: WIN });
      const on = (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); out(s); };
      p.stdout.on("data", on); p.stderr.on("data", on);
      p.on("close", (c) => resolve(c ?? 1));
    });
    out(`=== openflow run: exit ${code}\n`);
    if (code === 0 || !NETWORK.test(tail)) return code;
    info(`${bold("network drop")}: waiting for the connection, then resuming from .design/`);
    while (!(await online())) await sleep(30000);
    await sleep(20000);
  }
  warn(`gave up after ${retries} network drops`);
  return 1;
}
