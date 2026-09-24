# forge_blender.py — headless Blender asset production for the web. Run through `forge` (forge.mjs), or directly:
#   blender -b --factory-startup -P forge_blender.py -- <mode> [options as JSON]
# modes:
#   render     {"model": "a.glb", "hdri": "b.hdr", "out": "dir", "light": "studio|dark|hero|warm", "size": [1920,1080],
#               "transparent": false, "engine": "auto|eevee|cycles", "samples": 64, "turntable": 0, "angle": 30,
#               "path": "orbit|dolly|rise", "frames": 0, "format": "PNG|WEBP", "color": "#hex", "export": "x.glb"}
#   procedural {"shape": "glass-blob|chrome-knot|liquid-metal|crystal-cluster|silk-ribbon", "seed": 7, "color": "#hex",
#               "out": "dir", "export": "dir/name.glb", ...render options}
# Blender 4.2+ / 5.x. Lighting is real (HDRI + area lights), materials are Principled BSDF (exported to glTF PBR).
import bpy, bmesh, sys, json, math, os, random
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "render"
O = json.loads(argv[1]) if len(argv) > 1 else {}
OUT = os.path.abspath(O.get("out", "forge-out")); os.makedirs(OUT, exist_ok=True)
random.seed(O.get("seed", 7))

def log(*a): print("[forge]", *a, flush=True)
def hex_rgb(h, a=1.0):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4   # sRGB → linear
    return (lin(r), lin(g), lin(b), a)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = O.get("size", [1920, 1080])
    sc.render.film_transparent = bool(O.get("transparent", False))
    try: sc.view_settings.view_transform = "AgX"; sc.view_settings.look = O.get("look", "AgX - Medium High Contrast")
    except Exception: sc.view_settings.view_transform = "Filmic"
    return sc

def set_engine(sc):
    want = O.get("engine", "auto")
    engines = [e.identifier for e in sc.render.bl_rna.properties["engine"].enum_items]
    eevee = next((e for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE") if e in engines), None)
    if want in ("auto", "cycles") and (want == "cycles" or O.get("transmission_heavy")):
        use_cycles(sc)
    elif eevee and want in ("auto", "eevee"):
        sc.render.engine = eevee
        ee = sc.eevee
        for attr, val in (("taa_render_samples", O.get("samples", 64)), ("use_raytracing", True), ("use_shadows", True)):
            if hasattr(ee, attr): setattr(ee, attr, val)
    else:
        use_cycles(sc)
    log("engine", sc.render.engine)

def use_cycles(sc):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = O.get("samples", 64); sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try: prefs.compute_device_type = dev; prefs.get_devices(); break
            except Exception: continue
        for d in prefs.devices: d.use = True
        sc.cycles.device = "GPU" if any(d.type != "CPU" for d in prefs.devices) else "CPU"
    except Exception: sc.cycles.device = "CPU"

def world(sc, hdri, strength=1.0, rotation=0.0, bg=None):
    w = bpy.data.worlds.new("World"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nodes, links = nt.nodes, nt.links
    bgn = next(n for n in nodes if n.type == "BACKGROUND"); out = next(n for n in nodes if n.type == "OUTPUT_WORLD")
    if hdri and os.path.exists(hdri):
        env = nodes.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri)
        mp = nodes.new("ShaderNodeMapping"); tc = nodes.new("ShaderNodeTexCoord")
        mp.inputs["Rotation"].default_value[2] = math.radians(rotation)
        links.new(tc.outputs["Generated"], mp.inputs["Vector"]); links.new(mp.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], bgn.inputs["Color"])
    else:
        bgn.inputs["Color"].default_value = hex_rgb(bg or "#101014")
    bgn.inputs["Strength"].default_value = strength
    if bg and hdri:  # light from the HDRI, but a flat backdrop colour for the camera
        lp = nodes.new("ShaderNodeLightPath"); mix = nodes.new("ShaderNodeMixShader")
        b2 = nodes.new("ShaderNodeBackground"); b2.inputs["Color"].default_value = hex_rgb(bg)
        links.new(bgn.outputs["Background"], mix.inputs[1]); links.new(b2.outputs["Background"], mix.inputs[2])
        links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"]); links.new(mix.outputs["Shader"], out.inputs["Surface"])

def area(name, loc, energy, size, color="#ffffff", target=(0, 0, 0)):
    d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.color = hex_rgb(color)[:3]
    ob = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob

PRESETS = {  # HDRI strength, backdrop, lights (name, location, watts, size, color)
    "studio": dict(strength=1.0, bg=None, lights=[("key", (4, -4, 5), 800, 3, "#ffffff"), ("rim", (-4, 4, 3), 600, 2, "#dfe8ff")]),
    "dark":   dict(strength=0.25, bg="#07070a", floor=False, lights=[("rim_l", (-3.5, 2.5, 2), 1500, 1.2, "#8fb4ff"), ("rim_r", (3.5, 2.5, 1.5), 1300, 1.2, "#ff9a7a"), ("top", (0, 0, 5), 300, 4, "#ffffff")]),
    "hero":   dict(strength=0.6, bg="#0b0b0f", lights=[("key", (3, -3, 4), 1200, 1.5, "#fff3e6"), ("rim", (-2.5, 3, 2.5), 2200, 0.8, "#9ec5ff"), ("kick", (0, 4, -1), 500, 2, "#ffffff")]),
    "warm":   dict(strength=0.9, bg="#efe8df", lights=[("key", (4, -3, 5), 700, 4, "#ffe2c4"), ("fill", (-4, -2, 2), 200, 5, "#fff6ee")]),
}

def frame_objects(sc, objs, angle=30, fov_mm=85, margin=1.35):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    if not pts: pts = [Vector((0, 0, 0))]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 0.01)
    cam_d = bpy.data.cameras.new("cam"); cam_d.lens = fov_mm
    cam = bpy.data.objects.new("cam", cam_d); bpy.context.collection.objects.link(cam); sc.camera = cam
    fov = 2 * math.atan(cam_d.sensor_width / (2 * fov_mm)) * min(1, sc.render.resolution_y / sc.render.resolution_x) * 1.0
    dist = radius * margin / math.tan(fov / 2)
    a = math.radians(angle)
    cam.location = center + Vector((0, -dist * math.cos(a), dist * math.sin(a)))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    if O.get("dof"):
        cam_d.dof.use_dof = True; cam_d.dof.focus_distance = dist; cam_d.dof.aperture_fstop = O.get("fstop", 2.8)
    return cam, center, radius, dist

def light_rig(sc, center, radius):
    p = PRESETS.get(O.get("light", "studio"), PRESETS["studio"])
    world(sc, O.get("hdri"), p["strength"] * O.get("hdri_strength", 1.0), O.get("hdri_rotation", 0), O.get("bg", p["bg"]))
    s = max(radius, 0.1)
    for name, loc, w, size, col in p["lights"]:
        area(name, tuple(center + Vector(loc) * s), w * s * s, size * s, col, tuple(center))
    if O.get("floor", p.get("floor", True) and p["bg"] is not None and not O.get("transparent")):
        cove(center, radius, O.get("bg", p["bg"]) or "#15151a")

def cove(center, r, color):
    # seamless photo-studio sweep: floor under the object that curves up into a wall behind it (no horizon line)
    bm = bmesh.new(); prof = []
    floor_z, back_y, bend = center.z - r * 1.02, center.y + r * 4, r * 3
    for i in range(24):  # floor from the camera side to the start of the bend
        prof.append((center.y - r * 30 + (back_y - bend - (center.y - r * 30)) * i / 23, floor_z))
    for i in range(1, 17):  # quarter-circle bend
        a = (math.pi / 2) * i / 16
        prof.append((back_y - bend + math.sin(a) * bend, floor_z + bend - math.cos(a) * bend))
    prof.append((back_y, floor_z + r * 40))
    w = r * 60; rows = []
    for y, z in prof: rows.append((bm.verts.new((center.x - w, y, z)), bm.verts.new((center.x + w, y, z))))
    for (a0, b0), (a1, b1) in zip(rows, rows[1:]): bm.faces.new((a0, b0, b1, a1))
    me = bpy.data.meshes.new("cove"); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("cove", me); bpy.context.collection.objects.link(ob)
    for pg in me.polygons: pg.use_smooth = True
    me.materials.append(mat("cove", color, rough=0.55))

def mat(name, color="#cccccc", rough=0.3, metal=0.0, transmission=0.0, ior=1.45, coat=0.0, emission=None, thin_film=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    def s(key, v):
        for k in ([key] if isinstance(key, str) else key):
            if k in b.inputs: b.inputs[k].default_value = v; return
    s("Base Color", hex_rgb(color)); s("Roughness", rough); s("Metallic", metal)
    s(["Transmission Weight", "Transmission"], transmission); s("IOR", ior); s(["Coat Weight", "Clearcoat"], coat)
    if thin_film: s("Thin Film Thickness", thin_film)
    if emission: s(["Emission Color", "Emission"], hex_rgb(emission)); s("Emission Strength", 4.0)
    return m

def import_model(path):
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"): bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj": bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".fbx": bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".blend":
        with bpy.data.libraries.load(path) as (src, dst): dst.objects = src.objects
        for o in dst.objects: bpy.context.collection.objects.link(o)
    else: raise SystemExit(f"unsupported model {path}")
    return [o for o in bpy.data.objects if o not in before]

# ------------------------------------------------------------------------------------------------ procedural heroes
def smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True

def glass_blob(color):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=1.0)
    ob = bpy.context.object
    seed = O.get("seed", 7)
    for v in ob.data.vertices:
        n = v.co.normalized()
        d = noise.noise(n * 1.3 + Vector((seed, seed * 0.5, 0))) * 0.28 + noise.noise(n * 3.1) * 0.06
        v.co = n * (1 + d)
    smooth(ob); ob.data.materials.append(mat("glass", color, rough=0.04, transmission=1.0, ior=1.5, thin_film=O.get("thin_film", 380)))
    return [ob]

def chrome_knot(color, p=2, q=3):
    pts = []
    for i in range(400):
        t = 2 * math.pi * i / 400; r = math.cos(q * t) + 2
        pts.append((r * math.cos(p * t) * 0.45, r * math.sin(p * t) * 0.45, -math.sin(q * t) * 0.45))
    cu = bpy.data.curves.new("knot", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.16; cu.bevel_resolution = 8; cu.resolution_u = 4
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, c in enumerate(pts): sp.points[i].co = (*c, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new("knot", cu); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    ob = bpy.context.object; smooth(ob); ob.data.materials.append(mat("chrome", color, rough=0.08, metal=1.0))
    return [ob]

def liquid_metal(color):
    mb = bpy.data.metaballs.new("mb"); mb.resolution = 0.06; mb.render_resolution = 0.03
    for i in range(7):
        e = mb.elements.new(); e.co = (random.uniform(-0.8, 0.8), random.uniform(-0.5, 0.5), random.uniform(-0.6, 0.6)); e.radius = random.uniform(0.45, 0.8)
    ob = bpy.data.objects.new("liquid", mb); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    ob = bpy.context.object; smooth(ob); ob.data.materials.append(mat("liquid", color, rough=0.12, metal=1.0, thin_film=O.get("thin_film", 520)))
    return [ob]

def crystal_cluster(color):
    objs = []
    for i in range(9):
        bm = bmesh.new()
        h, w = random.uniform(0.9, 2.2), random.uniform(0.22, 0.42)
        for k in range(6):
            a = 2 * math.pi * k / 6
            bm.verts.new((math.cos(a) * w, math.sin(a) * w, 0)); bm.verts.new((math.cos(a) * w * 0.8, math.sin(a) * w * 0.8, h))
        bm.verts.new((0, 0, h + w * 1.6))
        bmesh.ops.convex_hull(bm, input=bm.verts)
        me = bpy.data.meshes.new(f"c{i}"); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f"crystal{i}", me); bpy.context.collection.objects.link(ob)
        ob.rotation_euler = (random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), random.uniform(0, 6.28)); ob.location = (random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), 0)
        ob.data.materials.append(mat("crystal", color, rough=0.02, transmission=1.0, ior=1.9))
        objs.append(ob)
    return objs

def silk_ribbon(color):
    cu = bpy.data.curves.new("ribbon", "CURVE"); cu.dimensions = "3D"; cu.resolution_u = 24
    cu.extrude = 0.35; cu.twist_mode = "MINIMUM"
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(5)
    for i, bp in enumerate(sp.bezier_points):
        x = -2.5 + i; bp.co = (x, math.sin(i * 1.3) * 0.6, math.cos(i * 0.9) * 0.4); bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.tilt = i * 0.9
    ob = bpy.data.objects.new("ribbon", cu); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    ob = bpy.context.object
    sol = ob.modifiers.new("thick", "SOLIDIFY"); sol.thickness = 0.02
    sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    smooth(ob); ob.data.materials.append(mat("satin", color, rough=0.35, metal=0.0, coat=0.6))
    return [ob]

PROC = {"glass-blob": (glass_blob, "#e8f0ff"), "chrome-knot": (chrome_knot, "#d8dce4"), "liquid-metal": (liquid_metal, "#c9ccd6"),
        "crystal-cluster": (crystal_cluster, "#cfe3ff"), "silk-ribbon": (silk_ribbon, "#c43d2f")}

# ------------------------------------------------------------------------------------------------ run
sc = reset()
if MODE == "procedural":
    fn, default = PROC[O.get("shape", O.get("preset", "glass-blob"))]
    objs = fn(O.get("color", default))
    if "transmission_heavy" not in O: O["transmission_heavy"] = O.get("shape", O.get("preset")) in ("glass-blob", "crystal-cluster")
elif MODE == "render":
    objs = import_model(O["model"])
else:
    raise SystemExit(f"unknown mode {MODE}")

if O.get("color") and MODE == "render" and O.get("recolor"):
    for o in objs:
        for m in (o.data.materials if o.type == "MESH" else []):
            b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if m and m.use_nodes else None
            if b: b.inputs["Base Color"].default_value = hex_rgb(O["color"])

set_engine(sc)
cam, center, radius, dist = frame_objects(sc, objs, O.get("angle", 25), O.get("lens", 85), O.get("margin", 1.3))
light_rig(sc, center, radius)

if O.get("export"):
    exp = os.path.abspath(O["export"]); os.makedirs(os.path.dirname(exp), exist_ok=True)
    for o in bpy.data.objects: o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=exp, export_format="GLB", use_selection=True, export_apply=True)
    log("exported", exp)

fmt = O.get("format", "PNG").upper()
fmts = [e.identifier for e in sc.render.image_settings.bl_rna.properties["file_format"].enum_items]
sc.render.image_settings.file_format = fmt if fmt in fmts else "PNG"
if sc.render.image_settings.file_format == "PNG": sc.render.image_settings.color_mode = "RGBA" if O.get("transparent") else "RGB"
if sc.render.image_settings.file_format == "WEBP": sc.render.image_settings.quality = O.get("quality", 88)

frames = int(O.get("frames") or O.get("turntable") or 0)
pivot = bpy.data.objects.new("pivot", None); bpy.context.collection.objects.link(pivot); pivot.location = center
if frames > 1:
    path = O.get("path", "orbit")
    for o in objs:
        if o.parent is None: o.parent = pivot; o.matrix_parent_inverse = pivot.matrix_world.inverted()
    sc.frame_start, sc.frame_end = 1, frames
    # set interpolation BEFORE keying (Blender 5 layered actions no longer expose action.fcurves)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR" if path == "orbit" else "BEZIER"
    if path == "orbit":      # object spins 360° (turntable) — the classic scroll-scrubbed product sequence
        pivot.rotation_euler = (0, 0, 0); pivot.keyframe_insert("rotation_euler", frame=1)
        pivot.rotation_euler = (0, 0, math.radians(O.get("degrees", 360))); pivot.keyframe_insert("rotation_euler", frame=frames)
    elif path == "dolly":    # camera pushes in
        start = cam.location.copy(); cam.keyframe_insert("location", frame=1)
        cam.location = center + (start - center) * O.get("dolly_to", 0.55); cam.keyframe_insert("location", frame=frames)
    elif path == "rise":     # camera cranes from low to high around the object
        a0, a1 = math.radians(O.get("from_angle", 5)), math.radians(O.get("to_angle", 60))
        for f, a in ((1, a0), (frames, a1)):
            cam.location = center + Vector((0, -dist * math.cos(a), dist * math.sin(a))); cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
            cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
    sc.render.filepath = os.path.join(OUT, "frame_####")
    bpy.ops.render.render(animation=True)
    log("frames", frames, OUT)
else:
    sc.render.filepath = os.path.join(OUT, O.get("name", "render"))
    bpy.ops.render.render(write_still=True)
    log("still", sc.render.filepath)
