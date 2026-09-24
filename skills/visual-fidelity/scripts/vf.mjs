#!/usr/bin/env node
// Cross-platform entry for vf (Windows uses vf.cmd → this; macOS/Linux use the `vf` shell wrapper).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const [cmd, ...rest] = process.argv.slice(2);
if (!["capture", "compare", "track", "teardown"].includes(cmd)) {
  console.log("usage: vf capture <url> --out DIR [--viewports 1440x900,390x844] [--scroll 0,0.5] [--wait ms] [--reduced-motion] [--full]");
  console.log("       vf compare <refDir> <curDir> --out DIR");
  console.log("       vf track <curRoot>   (trend + regression guard)");
  console.log("       vf teardown <url> --out DIR [--pages 6] [--no-video] [--no-assets]   (reverse-engineer a reference)");
  process.exit(2);
}
if (!existsSync(join(dir, "node_modules", "playwright-core"))) {
  const r = spawnSync("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", "--silent"], { stdio: "ignore", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("vf: npm install failed"); process.exit(1); }
}
const r = spawnSync(process.execPath, [join(dir, `${cmd}.mjs`), ...rest], { stdio: "inherit" });
process.exit(r.status ?? 1);
