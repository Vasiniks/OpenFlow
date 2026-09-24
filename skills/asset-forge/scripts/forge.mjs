#!/usr/bin/env node
// forge — real assets for award-level sites: sourced (CC0), rendered (headless Blender) or generated (keys only).
//   forge search <hdris|models|textures> <query>              Poly Haven catalogue search (CC0)
//   forge hdri <polyhaven-id> [--res 2k] --out public/hdri     download an HDRI (.hdr)
//   forge model <polyhaven-id> [--res 1k] --out public/models  download a model → optimised .glb
//   forge photos "<query>" --out public/img [--n 6]          CC0 photography (Openverse; Unsplash if UNSPLASH_ACCESS_KEY)
//   forge render <model.glb> --out DIR [--light studio|dark|hero|warm] [--hdri id|file] [--size 1920x1080]
//                [--shot product|hero|macro] [--focus x,y,z (object-radius units)] [--transparent] [--angle 25] [--dof]
//                [--samples 96] [--engine auto|eevee|cycles] [--name hero]
//   forge sequence <model.glb> --out DIR [--frames 120] [--path orbit|dolly|rise] [...render options]
//                → frame_0001.webp… + sequence.json (for a scroll-scrubbed canvas image sequence)
//   forge procedural <glass-blob|chrome-knot|liquid-metal|crystal-cluster|silk-ribbon> --out DIR [--color #hex]
//                [--seed n] [...render options] → <shape>.glb + hero render
//   forge blender <script.py> [-- args]                        run your own bpy modelling script headless (bespoke products)
//   forge optimize <in.glb> <out.glb>                          gltf-transform: dedup, weld, Draco geometry, WebP textures (Blender + three.js readable)
//   forge image "<prompt>" --out file.png [--size 1536x1024]    AI image: OPENAI_API_KEY (gpt-image-1) or FAL_KEY (flux);
//                                                               without a key: Pollinations (low-res, watermark) → moodboards only
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(homedir(), ".openflow", "cache", "forge");
const UA = "OpenFlow-forge/1 (https://github.com/Vasiniks/OpenFlow)";
const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i > -1 ? rest[i + 1] : d; };
const flag = (k) => rest.includes(`--${k}`);
const pos = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !["--transparent", "--dof"].includes(rest[i - 1])));
const die = (m) => { console.error(`forge: ${m}`); process.exit(1); };
const get = async (u, as = "json") => { const r = await fetch(u, { headers: { "User-Agent": UA } }); if (!r.ok) die(`${r.status} ${u}`); return as === "json" ? r.json() : Buffer.from(await r.arrayBuffer()); };
const save = async (u, file) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, await get(u, "buf")); return file; };

function blender() {
  const c = [process.env.BLENDER, platform() === "darwin" && "/Applications/Blender.app/Contents/MacOS/Blender", "blender",
    ...(platform() === "win32" ? (() => { try { return readdirSync("C:\\Program Files\\Blender Foundation").map((d) => `C:\\Program Files\\Blender Foundation\\${d}\\blender.exe`); } catch { return []; } })() : [])].filter(Boolean);
  for (const b of c) if (spawnSync(b, ["--version"], { stdio: "ignore" }).status === 0) return b;
  die("Blender not found (install from blender.org, or set BLENDER=/path/to/blender)");
}
function runBlender(mode, o) {
  const r = spawnSync(blender(), ["-b", "--factory-startup", "-P", join(HERE, "forge_blender.py"), "--", mode, JSON.stringify(o)], { encoding: "utf8", maxBuffer: 1 << 26 });
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => /\[forge\]|Error|Traceback|^\s+File /.test(l));
  console.log(lines.join("\n"));
  if (r.status !== 0 || /Traceback/.test(r.stderr)) die("blender failed");
}
async function hdriPath(v) {
  if (!v) v = "studio_small_09";                       // neutral studio default: glass and chrome need something to reflect
  if (existsSync(v)) return resolve(v);
  const f = join(CACHE, "hdri", `${v}_2k.hdr`);
  if (!existsSync(f)) { const files = await get(`https://api.polyhaven.com/files/${v}`); await save(files.hdri["2k"].hdr.url, f); }
  return f;
}
const size = () => (opt("size", "1920x1080")).split("x").map(Number);
// shot presets: product = whole object, hero = fills the frame, macro = a detail at 135mm with shallow depth of field
const SHOTS = { product: { margin: 1.15, lens: 85 }, hero: { margin: 0.9, lens: 85 }, macro: { margin: 0.28, lens: 135, dof: true, fstop: 4 } };
const shot = () => SHOTS[opt("shot", "product")] || SHOTS.product;
const renderOpts = async () => ({ ...shot(), light: opt("light", "studio"), hdri: await hdriPath(opt("hdri")), size: size(), transparent: flag("transparent"),
  angle: +opt("angle", 25), dof: flag("dof") || shot().dof || false, fstop: +opt("fstop", shot().fstop || 2.8), samples: +opt("samples", 96), engine: opt("engine", "auto"), name: opt("name", "hero"),
  color: opt("color"), bg: opt("bg"), margin: +opt("margin", shot().margin), lens: +opt("lens", shot().lens), format: opt("format", "PNG"),
  focus: opt("focus") ? opt("focus").split(",").map(Number) : undefined });

function optimize(input, output) {
  const r = spawnSync("npx", ["-y", "@gltf-transform/cli@4.5.0", "optimize", input, output, "--texture-compress", "webp", "--compress", "draco"], { stdio: "inherit", shell: platform() === "win32" });
  if (r.status !== 0) die("gltf-transform optimize failed");
  const kb = (f) => (statSync(f).size / 1024).toFixed(0);
  console.log(`optimised ${basename(input)} ${kb(input)}KB → ${basename(output)} ${kb(output)}KB`);
}

switch (cmd) {
  case "search": {
    const [type, ...q] = pos; const query = q.join(" ").toLowerCase();
    const all = await get(`https://api.polyhaven.com/assets?type=${type}`);
    const hits = Object.entries(all).filter(([id, a]) => (id + " " + a.name + " " + (a.tags || []).join(" ") + " " + (a.categories || []).join(" ")).toLowerCase().includes(query))
      .sort((a, b) => (b[1].download_count || 0) - (a[1].download_count || 0)).slice(0, 15);
    for (const [id, a] of hits) console.log(`${id.padEnd(32)} ${a.name} · ${(a.categories || []).slice(0, 4).join(",")} · https://polyhaven.com/a/${id}`);
    if (!hits.length) console.log("no match; try a broader word (studio, sunset, forest, marble, metal…)");
    break;
  }
  case "hdri": { const f = await hdriPath(pos[0]); const out = join(opt("out", "public/hdri"), basename(f)); mkdirSync(dirname(out), { recursive: true }); copyFileSync(f, out); console.log(`${out}  (CC0, Poly Haven ${pos[0] || "studio_small_09"})`); break; }
  case "model": {
    const id = pos[0], res = opt("res", "1k"), out = opt("out", "public/models"), tmp = join(CACHE, "models", id);
    const files = await get(`https://api.polyhaven.com/files/${id}`); const g = files.gltf?.[res]?.gltf; if (!g) die(`no ${res} glTF for ${id}`);
    await save(g.url, join(tmp, `${id}.gltf`));
    for (const [rel, f] of Object.entries(g.include || {})) await save(f.url, join(tmp, rel));
    mkdirSync(out, { recursive: true }); optimize(join(tmp, `${id}.gltf`), join(out, `${id}.glb`));
    console.log(`credit: "${id}" by Poly Haven, CC0 — https://polyhaven.com/a/${id}`); break;
  }
  case "photos": {
    const q = pos.join(" "), out = opt("out", "public/img"), n = +opt("n", 6); mkdirSync(out, { recursive: true });
    const credits = [];
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const r = await (await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${n}&orientation=landscape`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } })).json();
      for (const [i, p] of r.results.entries()) { const f = join(out, `${q.replace(/\W+/g, "-")}-${i + 1}.jpg`); await save(`${p.urls.raw}&w=2400&q=82&fm=jpg`, f); credits.push(`${f} — ${p.user.name} on Unsplash (${p.links.html})`); }
    } else {
      const r = await get(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=${n * 2}&size=large&aspect_ratio=wide`);
      for (const p of r.results.slice(0, n)) { try { const f = join(out, `${q.replace(/\W+/g, "-")}-${credits.length + 1}${(p.filetype && "." + p.filetype) || ".jpg"}`); await save(p.url, f); credits.push(`${f} — ${p.title || "untitled"} by ${p.creator || "unknown"} (${p.license.toUpperCase()}, ${p.foreign_landing_url})`); } catch {} }
    }
    writeFileSync(join(out, "CREDITS.txt"), credits.join("\n") + "\n"); console.log(credits.join("\n")); break;
  }
  case "render": { if (!pos[0]) die("render <model>"); runBlender("render", { ...(await renderOpts()), model: resolve(pos[0]), out: resolve(opt("out", "renders")) }); break; }
  case "sequence": {
    if (!pos[0]) die("sequence <model>");
    const out = resolve(opt("out", "sequence")), frames = +opt("frames", 120);
    runBlender("render", { ...(await renderOpts()), model: resolve(pos[0]), out, frames, path: opt("path", "orbit"), format: "WEBP", samples: +opt("samples", 48) });
    const files = readdirSync(out).filter((f) => /^frame_\d+\.(webp|png)$/.test(f)).sort();
    const [w, h] = size();
    writeFileSync(join(out, "sequence.json"), JSON.stringify({ frames: files.length, width: w, height: h, pattern: files[0]?.replace(/\d+/, "{####}"), files }, null, 1));
    console.log(`${files.length} frames → ${out}/sequence.json (draw frame = round(progress × ${files.length - 1}) on a <canvas> scrubbed by ScrollTrigger)`); break;
  }
  case "procedural": {
    const shape = pos[0] || "glass-blob", out = resolve(opt("out", "renders"));
    const raw = join(out, `${shape}.raw.glb`);
    runBlender("procedural", { ...(await renderOpts()), light: opt("light", "hero"), shape, seed: +opt("seed", 7), out, export: raw, frames: +opt("frames", 0), path: opt("path", "orbit") });
    optimize(raw, join(out, `${shape}.glb`)); break;
  }
  case "blender": {
    // run your own bpy script headless: it must build the object(s) and save a .blend or export a .glb itself
    // (e.g. bpy.ops.export_scene.gltf(filepath=OUT + "/product.raw.glb", export_format="GLB")); argv after "--" is passed through
    if (!pos[0] || !existsSync(pos[0])) die("blender <script.py> [-- args]");
    const extra = rest.includes("--") ? rest.slice(rest.indexOf("--") + 1) : [];
    const r = spawnSync(blender(), ["-b", "--factory-startup", "-P", resolve(pos[0]), "--", ...extra], { encoding: "utf8", maxBuffer: 1 << 26 });
    process.stdout.write(r.stdout.split("\n").filter((l) => !/^(Blender|Read|Fra:|Warning: .*colormanagement)/.test(l)).slice(-40).join("\n") + "\n");
    if (r.status !== 0 || /Traceback/.test(r.stderr + r.stdout)) { console.error(r.stderr.slice(-2000)); die("script failed"); }
    break;
  }
  case "optimize": optimize(resolve(pos[0]), resolve(pos[1])); break;
  case "image": {
    const prompt = pos.join(" "), out = resolve(opt("out", "image.png")), [w, h] = (opt("size", "1536x1024")).split("x").map(Number);
    mkdirSync(dirname(out), { recursive: true });
    if (process.env.OPENAI_API_KEY) {
      const r = await (await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-1", prompt, size: `${w}x${h}`, quality: "high" }) })).json();
      if (!r.data) die(JSON.stringify(r).slice(0, 300)); writeFileSync(out, Buffer.from(r.data[0].b64_json, "base64"));
    } else if (process.env.FAL_KEY) {
      const r = await (await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", { method: "POST", headers: { Authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ prompt, aspect_ratio: w > h ? "16:9" : w < h ? "9:16" : "1:1" }) })).json();
      if (!r.images) die(JSON.stringify(r).slice(0, 300)); await save(r.images[0].url, out);
    } else {
      console.error("forge: no OPENAI_API_KEY / FAL_KEY — using Pollinations (≈1024 px, watermark): MOODBOARD/REFERENCE ONLY, never ship it");
      await save(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Math.min(w, 1024)}&height=${Math.min(h, 1024)}&model=flux&seed=${opt("seed", 7)}`, out);
    }
    console.log(out); break;
  }
  default:
    console.log("usage: forge search|hdri|model|photos|render|sequence|procedural|optimize|image … (see the header of forge.mjs)");
}
