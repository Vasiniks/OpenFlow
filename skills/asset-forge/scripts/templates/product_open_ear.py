# Bespoke product template: open-ear headphone (arc band + two pods), real PBR materials, exported as glTF.
# Run:  forge blender product_open_ear.py -- --out public/models --color "#a8adb3"
# Then: forge optimize public/models/product.raw.glb public/models/product.glb
#       forge render public/models/product.glb --light dark --bg "#0a0a0b" --out public/img
#       forge sequence public/models/product.glb --frames 120 --out public/seq/product --bg "#0a0a0b"
# Adapt this, don't start from a cube: curves → bevel profile → convert → bevel + subdivision + weighted normals.
import bpy, math, sys, os
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
OUT = os.path.abspath(opt("--out", "public/models")); os.makedirs(OUT, exist_ok=True)
COLOR = opt("--color", "#a8adb3")

bpy.ops.wm.read_factory_settings(use_empty=True)
def lin(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1,)

def material(name, color, rough, metal=0.0, coat=0.0, sheen=0.0, aniso=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for k, v in (("Base Color", lin(color)), ("Roughness", rough), ("Metallic", metal), ("Coat Weight", coat), ("Sheen Weight", sheen), ("Anisotropic", aniso)):
        if k in b.inputs: b.inputs[k].default_value = v
    return m

TITANIUM = material("titanium", COLOR, 0.28, metal=1.0, aniso=0.6)      # brushed titanium
CERAMIC = material("ceramic", "#e9e4da", 0.18, coat=0.8)                  # glazed ceramic
FABRIC = material("fabric", "#2a2a2c", 0.85, sheen=0.7)                   # woven fabric

def finish(ob, bevel=0.004, sub=2):
    bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 3; bv.limit_method = "ANGLE"
    sd = ob.modifiers.new("sub", "SUBSURF"); sd.levels = sub; sd.render_levels = sub
    wn = ob.modifiers.new("wn", "WEIGHTED_NORMAL"); wn.keep_sharp = True
    for p in ob.data.polygons: p.use_smooth = True

def sweep(name, pts, radius, mat, closed=False):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = radius; cu.bevel_resolution = 6; cu.resolution_u = 24
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(len(pts) - 1)
    for p, c in zip(sp.bezier_points, pts): p.co = c; p.handle_left_type = p.handle_right_type = "AUTO"
    sp.use_cyclic_u = closed
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    ob = bpy.context.object; ob.data.materials.append(mat); finish(ob, 0.002, 1)
    return ob

# band: a flattened arc that sits behind the head, ends curving forward to the pods
band = sweep("band", [(-0.075, 0.0, 0.0), (-0.07, 0.05, 0.03), (0.0, 0.085, 0.045), (0.07, 0.05, 0.03), (0.075, 0.0, 0.0)], 0.0045, TITANIUM)
# pods: ceramic lozenge + fabric grille, one each side
for side in (-1, 1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.016, location=(side * 0.078, -0.004, 0.0))
    pod = bpy.context.object; pod.scale = (0.75, 1.0, 1.25); pod.name = f"pod_{side}"
    pod.data.materials.append(CERAMIC); finish(pod, 0.001, 1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.0085, depth=0.003, location=(side * 0.0685, -0.004, 0.002), rotation=(0, math.radians(90), 0))
    gr = bpy.context.object; gr.name = f"grille_{side}"; gr.data.materials.append(FABRIC); finish(gr, 0.0006, 1)

objs = [o for o in bpy.data.objects if o.type == "MESH"]
for o in objs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "product.raw.glb"), export_format="GLB", use_selection=True, export_apply=True)
print("[forge] exported", os.path.join(OUT, "product.raw.glb"))
