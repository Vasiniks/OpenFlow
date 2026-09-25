// browser.mjs — one launcher for every vf command.
// GPU-backed headless first: the bundled headless shell renders WebGL with SwiftShader (software). On a
// three.js-heavy site that starves the main thread. otsuka-air.jp measured ~10 s per scroll step on SwiftShader
// vs 0.4 s at 60 fps on Metal, so teardowns timed out. Falls back to the headless shell when no GPU channel launches.
// Set VF_SOFTWARE_GL=1 to force the software path.
import { chromium } from "playwright-core";

const GPU_ARGS = { darwin: ["--use-angle=metal", "--enable-gpu"], win32: ["--use-angle=d3d11", "--enable-gpu"] }[process.platform] || ["--enable-gpu"];

export async function launch(extraArgs = []) {
  const base = ["--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required", ...extraArgs];
  if (!process.env.VF_SOFTWARE_GL) {
    try {
      const b = await chromium.launch({ headless: true, channel: "chromium", args: [...base, ...GPU_ARGS] });
      b.__gl = "gpu";
      return b;
    } catch {}
  }
  const b = await chromium.launch({ headless: true, args: base });
  b.__gl = "software";
  return b;
}

// Renderer string as the page sees it, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro…)" or "…SwiftShader…".
export const glRenderer = (page) => page.evaluate(() => {
  try { const c = document.createElement("canvas").getContext("webgl"); const d = c?.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "unknown"; } catch { return "unavailable"; }
}).catch(() => "unknown");
