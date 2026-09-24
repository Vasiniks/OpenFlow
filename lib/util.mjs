// Small, dependency-free helpers shared by install and doctor. Works on macOS, Linux and Windows.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, openSync, closeSync, rmSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";

export const HOME = homedir();
export const WIN = platform() === "win32";
export const MAC = platform() === "darwin";
export const CONFIG = process.env.XDG_CONFIG_HOME || join(HOME, ".config");
export const OPENFLOW_HOME = process.env.OPENFLOW_HOME || join(HOME, ".openflow");
export const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
export const BACKUPS = join(OPENFLOW_HOME, "backups", STAMP);

let DRY = false;
export const setDryRun = (v) => { DRY = v; };
export const isDryRun = () => DRY;

const c = (n) => (s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
export const bold = c(1), dim = c(2), green = c(32), yellow = c(33), red = c(31);
export const step = (s) => console.log(`\n${bold("== " + s)}`);
export const info = (s) => console.log(`   ${s}`);
export const warn = (s) => console.log(`   ${yellow("!")} ${s}`);

// Windows needs a shell for .cmd shims (npx, claude, opencode); quote args ourselves so paths with spaces survive.
const q = (a) => (/[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
export function run(cmd, args = [], { quiet = false, input, env, cwd, allowFail = true, timeout = 600000 } = {}) {
  if (!quiet) info(dim(`→ ${cmd} ${args.join(" ")}`));
  if (DRY && !quiet) return { status: 0, stdout: "", stderr: "", dry: true };
  const r = spawnSync(WIN ? q(cmd) : cmd, WIN ? args.map(q) : args, {
    encoding: "utf8", shell: WIN, input, cwd, timeout, env: { ...process.env, ...(env || {}) },
    stdio: quiet || input !== undefined ? "pipe" : ["ignore", "pipe", "pipe"],
  });
  const out = { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || (r.error ? String(r.error.message) : "") };
  if (out.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(" ")} failed:\n${out.stderr}`);
  return out;
}
// Read-only probe that also runs in dry-run mode
export const probe = (cmd, args = [], opts = {}) => {
  const r = spawnSync(WIN ? q(cmd) : cmd, WIN ? args.map(q) : args, { encoding: "utf8", shell: WIN, timeout: 120000, ...opts });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
};

// Some CLIs (OpenCode on Bun) truncate large stdout at ~64 KB when it's a pipe; a file avoids that.
export function probeToFile(cmd, args = []) {
  const f = join(tmpdir(), `openflow-${process.pid}-${Date.now()}.out`), fd = openSync(f, "w");
  try { spawnSync(WIN ? q(cmd) : cmd, WIN ? args.map(q) : args, { stdio: ["ignore", fd, "ignore"], shell: WIN, timeout: 120000 }); }
  finally { closeSync(fd); }
  const out = readFileSync(f, "utf8"); rmSync(f, { force: true }); return out;
}

export function which(cmd) {
  const r = probe(WIN ? "where" : "which", [cmd]);
  return r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean)?.trim() : null;
}

export function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  const txt = readFileSync(path, "utf8");
  try { return JSON.parse(txt); } catch {
    // tolerate JSONC (comments / trailing commas) in harness configs
    try { return JSON.parse(txt.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); } catch { return null; }
  }
}
export function backup(path) {
  if (!existsSync(path) || DRY) return;
  const dst = join(BACKUPS, path.replace(HOME, "").replace(/[\\/:]/g, "_"));
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(path, dst);
}
export function writeJson(path, obj) {
  if (DRY) { info(dim(`(dry-run) would write ${path}`)); return; }
  backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}
export function writeText(path, text) {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;  // unchanged: no write, no backup
  if (DRY) { info(dim(`(dry-run) would write ${path}`)); return; }
  backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
export const exists = existsSync;
export { join, basename, dirname };
