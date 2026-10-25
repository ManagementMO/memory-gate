# The grandmother as a child: a girl of about eight in a California meadow in the 1950s, flying a red kite with her
# friend (the boy, public/people/boy.glb). She is built from the boy so the app's avatar code (social/avatar) takes her
# unchanged: the same MakeHuman child body, the same 52-bone Mixamo skeleton ("mixamorig:Hips" ...) and the same
# walk-in-place loop, facing +Z with her feet at y = 0, at her true size (1.29 m). What changes is everything that
# makes her read as a girl from across the meadow: a long dark-brown ponytail, a red-and-white gingham blouse with a
# white collar and a red skirt, white socks and black shoes, thinner eyebrows, longer lashes, and a young female skin
# toned like the boy's.
#
# MPFB (MakeHuman for Blender) isn't needed: each MakeHuman asset is fitted here the way MPFB and MakeHuman do it. An
# asset's .mhclo binds each of its vertices to three vertices of the hm08 base mesh (barycentric weights plus an offset
# scaled by the body's size), so fitting it to the boy's body (his shape keys applied, before skinning and masks) puts
# it exactly where MPFB would; its skin weights are the same blend of those body vertices' weights; and the body faces
# a garment covers completely (its delete_verts) are masked away so skin can't poke through while she walks. Garments
# made for adults need three touches on a child: the skirt's front, hung from the crotch, is shaped from its neighbours
# (relax_far); skin and the skirt's waistband are tucked a few millimetres in under what covers them (tuck); and the
# walk's arms swing 4 degrees wider so her fingers clear the skirt (arms_out).
#
# Sources
#   ~/Downloads/spanish_boy_and_grandma_vr/spanish_boy_and_grandma.blend   the boy (and the grandmother, left out)
#   ~/Downloads/vr-characters/makehuman_system_assets_cc0.zip              MakeHuman system assets (the zip or a folder):
#     hair/ponytail01, clothes/female_elegantsuit01 (blouse and skirt), clothes/shoes04, eyebrows/eyebrow006 (the
#     grandmother's own brows), eyelashes/eyelashes02, skins/young_caucasian_female; recoloured here (gingham and red,
#     dark brown, white socks, the boy's skin tone)
# Credits: MakeHuman (makehumancommunity.org) and MPFB 2 assets and the hm08 base mesh, released as CC0 by Data
# Collection AB, Joel Palmius and Jonas Hauquier. CC0: free for any use, no credit required, given with thanks.
#
# Run (built with Blender 5.4; nothing to install), then make the raw export light for the headset:
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python apps/gate/scripts/make-girl.py -- \
#     /tmp/girl/girl.glb [--blend PATH] [--assets ZIP_OR_DIR] [--height 1.29] [--save-blend /tmp/girl/girl.blend]
#   node apps/gate/scripts/prepare-people.mjs --girl /tmp/girl/girl.glb     (→ public/people/girl.glb)
import argparse
import atexit
import os
import shutil
import sys
import tempfile
import zipfile

import bpy
import numpy as np

HOME = os.path.expanduser('~')
GIRL = 'Girl'
# Gingham check size (one red-and-white repeat) on her blouse, in metres, and the outfit's colours (sRGB 0-1).
CHECK = 0.026
RED, WHITE, SKIRT, COLLAR = (0.76, 0.11, 0.13), (0.97, 0.95, 0.91), (0.62, 0.09, 0.11), (0.96, 0.94, 0.89)
SOCKS = (0.95, 0.94, 0.91)
# Garment parts hanging free (the skirt between her legs) are shaped from their neighbours past this binding reach (m).
RELAX = {'female_elegantsuit01': 0.04}
ARMS_OUT = 4.0  # degrees: the walk's arms a little further from her sides, clear of the skirt


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='make-girl.py', description='Build the girl (raw glTF export) from the boy and MakeHuman assets.')
    p.add_argument('out', help='where to write the raw .glb (keep it out of the repo; prepare-people.mjs optimizes it)')
    p.add_argument('--blend', default=os.path.join(HOME, 'Downloads/spanish_boy_and_grandma_vr/spanish_boy_and_grandma.blend'))
    p.add_argument('--assets', default=os.path.join(HOME, 'Downloads/vr-characters/makehuman_system_assets_cc0.zip'))
    p.add_argument('--height', type=float, default=1.29, help='her height in metres, top of the hair (the boy is 1.31)')
    p.add_argument('--save-blend', help='also save the finished scene here, to look at in Blender')
    return p.parse_args(argv)


# ---------------------------------------------------------------- MakeHuman assets (.mhclo, .obj) and their fitting

class Assets:
    """The MakeHuman system asset pack, read straight from its zip (or an unzipped folder)."""

    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path) if os.path.isfile(path) else None
        self.tmp = tempfile.mkdtemp(prefix='mh-assets-')  # images are packed into the scene as they load
        atexit.register(shutil.rmtree, self.tmp, ignore_errors=True)

    def _member(self, rel):
        names = self.zip.namelist()
        if rel in names: return rel
        found = [n for n in names if n.endswith('/' + rel)]
        if not found: raise FileNotFoundError(f'{rel} is not in {self.path}')
        return found[0]

    def text(self, rel):
        if self.zip: return self.zip.read(self._member(rel)).decode('utf-8', 'replace')
        with open(os.path.join(self.path, rel), encoding='utf-8', errors='replace') as f: return f.read()

    def file(self, rel):
        return self.zip.extract(self._member(rel), self.tmp) if self.zip else os.path.join(self.path, rel)


def parse_mhclo(text):
    """Scale references, one (3 body vertices, 3 weights, offset) binding per asset vertex, and the delete_verts."""
    clo = {'scale': {}, 'idx': [], 'w': [], 'd': [], 'delete': []}
    section, dtoks = None, []
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].strip()
        if not line: continue
        tok = line.split()
        if tok[0][0].isalpha():
            if tok[0] in ('x_scale', 'y_scale', 'z_scale'): clo['scale'][tok[0][0]] = (int(tok[1]), int(tok[2]), float(tok[3]))
            elif tok[0] == 'verts': section = 'verts'
            elif tok[0] == 'delete_verts': section = 'delete'
            elif len(tok) > 1: clo.setdefault(tok[0], tok[1])
            continue
        if section == 'verts':
            if len(tok) == 1:  # bound exactly to one body vertex
                clo['idx'].append((int(tok[0]),) * 3); clo['w'].append((1.0, 0.0, 0.0)); clo['d'].append((0.0, 0.0, 0.0))
            else:
                clo['idx'].append(tuple(int(t) for t in tok[:3]))
                clo['w'].append(tuple(float(t) for t in tok[3:6]))
                clo['d'].append(tuple(float(t) for t in tok[6:9]))
        elif section == 'delete':
            dtoks += tok
    i = 0
    while i < len(dtoks):  # "a - b" is a range
        if i + 2 < len(dtoks) and dtoks[i + 1] == '-': clo['delete'] += range(int(dtoks[i]), int(dtoks[i + 2]) + 1); i += 3
        else: clo['delete'].append(int(dtoks[i])); i += 1
    for k in ('idx', 'w', 'd'): clo[k] = np.array(clo[k])
    return clo


def parse_obj(text):
    """Vertices (as fitted to MakeHuman's default body), UVs and faces (vertex, uv) of an asset's .obj; its vertices
    are in the .mhclo's order."""
    vs, vts, faces = [], [], []
    for line in text.splitlines():
        if line.startswith('v '): vs.append([float(t) for t in line.split()[1:4]])
        elif line.startswith('vt '): p = line.split(); vts.append((float(p[1]), float(p[2])))
        elif line.startswith('f '):
            f = []
            for c in line.split()[1:]:
                p = c.split('/')
                f.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else 0))
            faces.append(f)
    return np.array(vs), np.array(vts), faces


# MakeHuman works in decimetres with Y up; MPFB's base mesh in Blender is that × 0.1 with axes (x, -z, y).
def to_mh(co): return np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1) * 10.0
def from_mh(mh): return np.stack([mh[:, 0], -mh[:, 2], mh[:, 1]], 1) * 0.1


def offset_scale(clo, B):
    return np.array([abs(B[clo['scale'][a][0], k] - B[clo['scale'][a][1], k]) / clo['scale'][a][2] for k, a in enumerate('xyz')])


def fit(clo, base):
    """Asset vertex positions on this body (Blender coordinates of the base mesh in, the same out)."""
    B = to_mh(base)
    return from_mh((B[clo['idx']] * clo['w'][..., None]).sum(1) + clo['d'] * offset_scale(clo, B))


def interp_weights(clo, W):
    """Each asset vertex's bone weights: its three body vertices' weights, blended as it is bound to them."""
    out = np.clip(np.einsum('nk,nkb->nb', clo['w'], W[clo['idx']]), 0, None)
    out[out < 1e-3] = 0
    tot = out.sum(1, keepdims=True)
    return np.divide(out, tot, out=np.zeros_like(out), where=tot > 0)


def relax_far(clo, base, co, weights, faces, orig, limit):
    """Vertices bound to body vertices far away (more than `limit` metres) are placed by their neighbours instead,
    keeping the garment's own shape there (its offsets from them in the .obj, scaled to this body). A skirt hangs
    free between the legs: on a child its front centre, hung from the crotch by adult-length offsets, would make a
    ridge and dip into a point 5 cm below the hem. A hem vertex follows only its neighbours along the hem."""
    s = offset_scale(clo, to_mh(base))
    far = np.nonzero(np.linalg.norm(clo['d'] * s, axis=1) * 0.1 > limit)[0]
    if not len(far): return 0
    shape = from_mh(orig * s)
    edges = {}
    for f in faces:
        vs = [v for v, _ in f]
        for a, b in zip(vs, vs[1:] + vs[:1]): edges[(min(a, b), max(a, b))] = edges.get((min(a, b), max(a, b)), 0) + 1
    nb, rim = {int(v): set() for v in far}, {int(v): set() for v in far}
    for (a, b), n in edges.items():
        for x, y in ((a, b), (b, a)):
            if x in nb:
                nb[x].add(y)
                if n == 1: rim[x].add(y)
    for _ in range(200):
        for v in nb:
            ring = list(rim[v] or nb[v])
            co[v] = (co[ring] + shape[v] - shape[ring]).mean(0)
            weights[v] = weights[ring].mean(0)
    return len(far)


def tuck(co, nor, which, garments, margin, reach=0.012):
    """Move the surface `co` (normals `nor`) in under the garments wherever it would show through one, so it lies at
    least `margin` inside: a few millimetres nobody sees. `garments`: (vertices, faces) each."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    trees = [BVHTree.FromPolygons(gco.tolist(), [[v for v, _ in f] for f in gfaces]) for gco, gfaces in garments]
    moved = 0
    for i in which:
        p, n = Vector(co[i]), Vector(nor[i])
        push = 0.0
        for t in trees:
            out = t.ray_cast(p, n, reach)
            if out[0] is not None:
                if out[3] < margin: push = max(push, margin - out[3])  # under it, but too close
                continue
            inn = t.ray_cast(p, -n, 0.008)
            if inn[0] is not None: push = max(push, inn[3] + margin)  # through it
        if push:
            co[i] -= nor[i] * min(push, reach)
            moved += 1
    return moved


def tuck_skin(body, visible, garments, margin=0.004):
    """Skin that would show through a garment's edge (thighs near the skirt's hem, the neck under the collar, wrists in
    the cuffs) goes in under it."""
    me = body.data
    co, nor = coords_of(me), np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', nor)
    moved = tuck(co, nor.reshape(-1, 3), np.nonzero(visible)[0], garments, margin)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    return moved


def tuck_skirt(co, faces, margin=0.003):
    """The skirt's waistband goes in under the blouse that hangs over it (it would show through in spots)."""
    par = list(range(len(co)))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for f in faces:
        for v, _ in f[1:]: par[find(v)] = find(f[0][0])
    root = np.array([find(v) for v in range(len(co))])
    parts = {r: co[root == r, 2].mean() for r in set(root.tolist())}
    skirt = min(parts, key=parts.get)
    nor = np.zeros_like(co)
    for f in faces:
        vs = [v for v, _ in f]
        nor[vs] += sum(np.cross(co[vs[k]] - co[vs[0]], co[vs[k + 1]] - co[vs[0]]) for k in range(1, len(vs) - 1))
    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-12)
    blouse = [f for f in faces if root[f[0][0]] != skirt]
    return tuck(co, nor, np.nonzero(root == skirt)[0], [(co.copy(), blouse)], margin)


def covered(body_me, delete):
    """The body vertices to mask under a garment: those whose every face lies within its delete_verts (as MPFB does,
    so a face only goes when the garment covers all of it)."""
    d = np.zeros(len(body_me.vertices), bool)
    d[delete] = True
    keep = d.copy()
    for p in body_me.polygons:
        vs = p.vertices[:]
        if not all(d[i] for i in vs):
            keep[list(vs)] = False
    return np.nonzero(keep)[0]


# ---------------------------------------------------------------- Blender helpers

def coords_of(me):
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def bake_shape(body):
    """Make the body's shape keys (the child shape) its plain rest shape: the base the assets are fitted to."""
    if body.data.shape_keys:
        mix = body.shape_key_add(name='mix', from_mix=True)
        co = np.empty(len(mix.data) * 3)
        mix.data.foreach_get('co', co)
        body.shape_key_clear()
        body.data.vertices.foreach_set('co', co)
        body.data.update()
    return coords_of(body.data)


def bone_weights(ob, bones):
    col = {b: i for i, b in enumerate(bones)}
    name = {g.index: g.name for g in ob.vertex_groups}
    W = np.zeros((len(ob.data.vertices), len(bones)))
    for v in ob.data.vertices:
        for g in v.groups:
            j = col.get(name[g.group])
            if j is not None: W[v.index, j] = g.weight
    return W


def build_proxy(arm, name, mesh_name, co, vts, faces, weights, bones, material):
    me = bpy.data.meshes.new(mesh_name)
    me.from_pydata(co.tolist(), [], [[v for v, _ in f] for f in faces])
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', np.array([vts[t] for f in faces for _, t in f]).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.validate()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    for c in arm.users_collection: c.objects.link(ob)
    ob.parent = arm
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    for j, b in enumerate(bones):
        idx = np.nonzero(weights[:, j])[0]
        if not len(idx): continue
        g = ob.vertex_groups.new(name=b)
        for i in idx: g.add([int(i)], float(weights[i, j]), 'REPLACE')
    return ob


def remove_object(ob):
    data = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if data is not None and data.users == 0:
        (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.armatures).remove(data)


def arms_out(arm, action, degrees):
    """Swing the walk's upper arms this much further out from her sides (about the body's front-back axis at the
    shoulder): the boy's loop brushes his hands past his jeans, and her fingertips would dip into the wider skirt."""
    from mathutils import Quaternion, Vector
    fcurves = action_fcurves(action)
    for side, sign in (('Left', -1), ('Right', 1)):
        name = f'mixamorig:{side}Arm'
        axis = arm.data.bones[name].matrix_local.to_3x3().inverted() @ Vector((0, 1, 0))
        turn = Quaternion(axis, np.radians(degrees) * sign)
        q = sorted((fc for fc in fcurves if fc.data_path == f'pose.bones["{name}"].rotation_quaternion'), key=lambda fc: fc.array_index)
        frames = sorted({k.co.x for fc in q for k in fc.keyframe_points})
        new = {f: turn @ Quaternion([fc.evaluate(f) for fc in q]) for f in frames}
        for fc in q:
            for k in fc.keyframe_points:
                d = new[k.co.x][fc.array_index] - k.co.y
                k.co.y += d; k.handle_left.y += d; k.handle_right.y += d
            fc.update()


def action_fcurves(action):
    if hasattr(action, 'fcurves'): return list(action.fcurves)  # Blender < 5.0
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]


# ---------------------------------------------------------------- textures (numpy on Blender images)

def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)  # rows bottom-up, like UV v


def new_image(name, a):
    h, w = a.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(a, 0, 1), np.float32).ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def load_image(assets, rel, non_color=False):
    img = bpy.data.images.load(assets.file(rel))
    img.pack()
    if non_color: img.colorspace_settings.name = 'Non-Color'
    return img


def lum(a): return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def box_blur(a, r):
    k = 2 * r + 1
    c = np.cumsum(np.pad(a, ((r + 1, r), (0, 0)), mode='edge'), 0); a = (c[k:] - c[:-k]) / k
    c = np.cumsum(np.pad(a, ((0, 0), (r + 1, r)), mode='edge'), 1); return (c[:, k:] - c[:, :-k]) / k


def raster(tris, w, h):
    """Which texels the UV triangles (T, 3, 2) cover."""
    m = np.zeros((h, w), bool)
    for t in tris * [w, h] - 0.5:
        x0, y0 = np.maximum(np.floor(t.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(t.max(0)).astype(int), [w - 1, h - 1])
        if x1 < x0 or y1 < y0: continue
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        m[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -1e-3) & (l2 >= -1e-3) & (l1 + l2 <= 1 + 1e-3)
    return m


def grow(label, n):
    """Spread each UV island's label n texels into the empty space around it, so mipmaps don't bleed colours at seams."""
    for _ in range(n):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(label, (dy, dx), (0, 1))
            fill = (label == 0) & (sh > 0)
            label[fill] = sh[fill]
    return label


def uv_islands(vts, faces):
    par = list(range(len(vts)))
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for f in faces:
        r = find(f[0][1])
        for _, t in f[1:]: par[find(t)] = r
    out = {}
    for i, f in enumerate(faces): out.setdefault(find(f[0][1]), []).append(i)
    return list(out.values())


def tris_of(vts, faces, which):
    return np.array([[vts[faces[i][0][1]], vts[faces[i][k][1]], vts[faces[i][k + 1][1]]] for i in which for k in range(1, len(faces[i]) - 1)])


def area3(co, faces, which):
    a = 0.0
    for i in which:
        p = co[[v for v, _ in faces[i]]]
        for k in range(1, len(p) - 1): a += np.linalg.norm(np.cross(p[k] - p[0], p[k + 1] - p[0])) / 2
    return a


def outfit_texture(co, vts, faces, src_diffuse, src_ao, scale):
    """Blouse and skirt: the skirt (the panel below the waist) red, the collar white, the rest of the blouse gingham.
    The garment's own ambient occlusion keeps its folds; its normal map is kept as it is."""
    src = pixels(src_diffuse)
    h, w = src.shape[:2]
    ao = pixels(src_ao)[..., 0] if src_ao else np.ones((h, w), np.float32)
    if ao.shape != (h, w): ao = np.ones((h, w), np.float32)
    islands = uv_islands(vts, faces)
    zc = [co[[v for i in isl for v, _ in faces[i]], 2].mean() for isl in islands]
    top = max(co[:, 2])
    label = np.zeros((h, w), np.int8)
    blouse = []
    for isl, z in zip(islands, zc):
        kind = 1 if z < top - 0.4 else 3 if z > top - 0.06 else 2  # skirt / blouse / collar, by height on the body
        label[raster(tris_of(vts, faces, isl), w, h)] = kind
        if kind == 2: blouse += isl
    label = grow(label, 24)
    label[label == 0] = 1
    # Texel size on the blouse, so the checks are CHECK metres across on her.
    tri = tris_of(vts, faces, blouse)
    e1, e2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
    uv_area = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum() / 2 * w * h
    per = CHECK / (np.sqrt(area3(co, faces, blouse) * scale * scale / uv_area))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    def band(x):  # 0/1 square wave, half on, softened over a texel
        f = np.abs((x / per) % 1.0 - 0.5) * per
        return np.clip(f - per / 4 + 0.5, 0, 1)
    g = (band(xs) + band(ys))[..., None] / 2
    gingham = np.array(WHITE) + (np.array(RED) - np.array(WHITE)) * g
    L = lum(src)
    weave = np.clip(L / np.maximum(box_blur(L, 6), 1e-3), 0.9, 1.1)[..., None]  # the skirt fabric's own grain
    out = np.empty((h, w, 4), np.float32)
    out[..., :3] = np.where((label == 2)[..., None], gingham, np.where((label == 3)[..., None], np.array(COLLAR), np.array(SKIRT) * weave))
    out[..., :3] *= np.where(label == 1, 0.85 + 0.15 * ao, 0.62 + 0.38 * ao)[..., None]  # the skirt's AO is mostly the blouse over it
    out[..., 3] = 1
    print(f'  outfit: gingham repeat {per:.1f} px of {w}')
    return new_image('female_elegantsuit01_gingham_diffuse', out)


def hair_texture(src, like):
    """The ponytail in the boy's dark brown: its own strand detail, without its light-brown ends."""
    a, ref = pixels(src), pixels(like)
    m = ref[..., 3] > 0.5
    target = ref[..., :3][m].mean(0)
    L, al = lum(a), a[..., 3]
    local = box_blur(L * al, 40) / np.maximum(box_blur(al, 40), 1e-3)
    detail = np.clip(L / np.maximum(local, 1e-3), 0.35, 1.9)
    out = a.copy()
    out[..., :3] = np.clip(target * detail[..., None] ** 1.1, 0, 1)
    return new_image('ponytail01_darkbrown_diffuse', out)


def tint(src, like, name, darken=0.8):
    """Brows in the hair's dark brown (a little darker), rather than the asset's black: softer on a child's face."""
    a, ref = pixels(src), pixels(like)
    target = ref[..., :3][ref[..., 3] > 0.5].mean(0) * darken
    L = lum(a)
    m = a[..., 3] > 0.3
    a[..., :3] = np.clip(target * (L / max(L[m].mean(), 1e-3))[..., None], 0, 1)
    return new_image(name, a)


def socks_texture(src, vts, faces, co):
    """shoes04's socks (the UV island highest up her leg) white; the black shoes as they are."""
    a = pixels(src)
    h, w = a.shape[:2]
    islands = uv_islands(vts, faces)
    sock = max(islands, key=lambda isl: co[[v for i in isl for v, _ in faces[i]], 2].mean())
    m = grow(raster(tris_of(vts, faces, sock), w, h).astype(np.int8), 8) > 0
    L = lum(a)
    s = np.clip(L / L[m].mean() * 0.93, 0, 1)
    a[..., :3] = np.where(m[..., None], s[..., None] * np.array(SOCKS), a[..., :3])
    return new_image('shoes04_whitesocks_diffuse', a)


def skin_texture(src, like):
    """MakeHuman's young female skin in the boy's skin tone, region by region (the same UV layout): its own detail,
    his colour at a 40-texel scale, so her face is as sun-warmed as his rather than the asset's pale one."""
    if tuple(like.size) != tuple(src.size):
        like = like.copy()
        like.scale(*src.size)
    a, ref = pixels(src), pixels(like)
    for c in range(3):
        a[..., c] *= np.clip(box_blur(ref[..., c], 40) / np.maximum(box_blur(a[..., c], 40), 1e-3), 0.6, 1.5)
    return new_image('girl_young_lightskinned_female_diffuse', a)


def material_from(template, name, images):
    m = bpy.data.materials[template].copy()
    m.name = name
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.name in images: n.image = images[n.name]
    return m


# ---------------------------------------------------------------- the build

def main():
    args = parse_args()
    assets = Assets(args.assets)
    bpy.ops.wm.open_mainfile(filepath=args.blend)

    # Only the boy is kept (he becomes the girl); the grandmother, her walk and everything only she used go.
    for ob in [o for o in bpy.data.objects if o.name == 'Grandma' or (o.parent and o.parent.name == 'Grandma')]:
        remove_object(ob)
    for a in [a for a in bpy.data.actions if not a.name.startswith('Boy')]: bpy.data.actions.remove(a)
    bpy.data.orphans_purge(do_recursive=True)

    arm = bpy.data.objects['Boy']
    arm.name = arm.data.name = GIRL
    arm.location = (0, 0, 0)  # centred (the .blend has him at x = -0.4)
    act = arm.animation_data.action
    act.name = f'{GIRL}_Walk_InPlace'
    bones = [b.name for b in arm.data.bones]
    body = bpy.data.objects['Boy.body']
    base = bake_shape(body)  # the boy's child body at rest: what every asset is fitted to
    W = bone_weights(body, bones)

    # What changes: hair, clothes, shoes, brows and lashes (eyes, teeth and tongue stay).
    for n in ('male_casualsuit06', 'shoes06', 'short02', 'eyebrow001', 'eyelashes01'):
        remove_object(bpy.data.objects[f'Boy.{n}'])
        g = body.vertex_groups.get(f'Delete.{n}')
        if g: body.vertex_groups.remove(g)
    for m in [m for m in body.modifiers if m.type == 'MASK' and m.vertex_group.startswith('Delete.')]: body.modifiers.remove(m)

    imgs = bpy.data.images
    proxies = {
        'ponytail01': ('hair/ponytail01', 'Boy.short02'),
        'female_elegantsuit01': ('clothes/female_elegantsuit01', 'Boy.male_casualsuit06'),
        'shoes04': ('clothes/shoes04', 'Boy.shoes06'),
        'eyebrow006': ('eyebrows/eyebrow006', 'Boy.eyebrow001'),
        'eyelashes02': ('eyelashes/eyelashes02', 'Boy.eyelashes01'),
    }
    built = {}
    for name, (folder, template) in proxies.items():
        clo = parse_mhclo(assets.text(f'{folder}/{name}.mhclo'))
        orig, vts, faces = parse_obj(assets.text(f'{folder}/{clo["obj_file"]}'))
        if len(orig) != len(clo['idx']): raise RuntimeError(f'{name}: {len(orig)} vertices in the .obj, {len(clo["idx"])} in the .mhclo')
        co, weights = fit(clo, base), interp_weights(clo, W)
        relaxed = relax_far(clo, base, co, weights, faces, orig, RELAX[name]) if name in RELAX else 0
        if relaxed: print(f'  {name}: {relaxed} far-bound vertices placed between their neighbours')
        if name == 'female_elegantsuit01': print(f'  {name}: skirt tucked in under the blouse at {tuck_skirt(co, faces)} vertices')
        built[name] = (clo, vts, faces, co, weights, template)

    scale = args.height / max(built['ponytail01'][3][:, 2].max(), base[:13380, 2].max())  # 13380: the body, no helpers
    suit, shoes = built['female_elegantsuit01'], built['shoes04']

    # Textures: recoloured from the assets' own maps, through copies of the boy's materials (same alpha cut-outs).
    textures = {
        'ponytail01': hair_texture(load_image(assets, 'hair/ponytail01/ponytail01_diffuse.png'), imgs['short02_darkbrown__short02_diffuse.png']),
        'female_elegantsuit01': outfit_texture(suit[3], suit[1], suit[2],
                                               load_image(assets, 'clothes/female_elegantsuit01/female_elegantsuit01_diffuse.png'),
                                               load_image(assets, 'clothes/female_elegantsuit01/female_elegantsuit01_ao.png', non_color=True), scale),
        'shoes04': socks_texture(load_image(assets, 'clothes/shoes04/shoes04_diffuse.png'), shoes[1], shoes[2], shoes[3]),
        'eyebrow006': tint(load_image(assets, 'eyebrows/eyebrow006/eyebrow006.png'), imgs['short02_darkbrown__short02_diffuse.png'], 'eyebrow006_darkbrown'),
        'eyelashes02': load_image(assets, 'eyelashes/eyelashes02/eyelashes02.png'),
    }
    normal = load_image(assets, 'clothes/female_elegantsuit01/female_elegantsuit01_normal.png', non_color=True)

    visible = np.zeros(len(base), bool)
    visible[[v.index for v in body.data.vertices if any(g.group == body.vertex_groups['body'].index for g in v.groups)]] = True
    for name, (clo, vts, faces, co, weights, template) in built.items():
        tex = textures[name]
        mat = material_from(template, f'{GIRL}.{name}', {'DiffuseTexture': tex, 'AlphaMapTexture': tex, 'NormalTexture': normal, 'NormalMapTextue': normal})
        build_proxy(arm, f'{GIRL}.{name}', name, co, vts, faces, weights, bones, mat)
        hidden = covered(body.data, clo['delete']) if clo['delete'] else []
        if len(hidden):
            g = body.vertex_groups.new(name=f'Delete.{name}')
            g.add([int(i) for i in hidden], 1.0, 'REPLACE')
            mod = body.modifiers.new(f'Delete.{name}', 'MASK')
            mod.vertex_group, mod.invert_vertex_group = g.name, True
            visible[hidden] = False
        print(f'  {name}: {len(co)} vertices, {len(faces)} faces, {len(hidden)} body vertices masked under it')
    print(f'  skin tucked in under the clothes at {tuck_skin(body, visible, [(suit[3], suit[2]), (shoes[3], shoes[2])])} vertices')

    skin = skin_texture(load_image(assets, 'skins/young_caucasian_female/young_lightskinned_female_diffuse.png'),
                        imgs['spanish_boy__young_lightskinned_male_diffuse.png'])
    body.active_material = material_from('Boy.body', f'{GIRL}.body', {'DiffuseTexture': skin})
    for ob in list(arm.children):
        if ob.name.startswith('Boy.'):
            ob.name = GIRL + ob.name[3:]
            for slot in ob.material_slots:
                if slot.material and slot.material.name.startswith('Boy.'): slot.material.name = GIRL + slot.material.name[3:]

    arms_out(arm, act, ARMS_OUT)

    # Her true size: scale the rest pose, the meshes and the walk's moves together (no scale left on any node).
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    rest = [(eb, eb.head * scale, eb.tail * scale, eb.roll) for eb in arm.data.edit_bones]  # all first: connected
    for eb, head, tail, roll in rest:                                                          # bones share points
        eb.head, eb.tail, eb.roll = head, tail, roll
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob in arm.children:
        ob.data.vertices.foreach_set('co', (coords_of(ob.data) * scale).ravel())
        ob.data.update()
    for fc in action_fcurves(act):
        if fc.data_path.endswith('.location'):
            for k in fc.keyframe_points:
                k.co.y *= scale; k.handle_left.y *= scale; k.handle_right.y *= scale
            fc.update()
    bpy.data.orphans_purge(do_recursive=True)
    print(f'  height {args.height:.3f} m (scale {scale:.4f} of the boy)')

    for path in filter(None, (args.out, args.save_blend)): os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if args.save_blend: bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend), copy=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [arm, *arm.children]: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(args.out), export_format='GLB', use_selection=True, export_apply=True,
                              export_skins=True, export_animations=True, export_animation_mode='ACTIONS', export_morph=False, export_yup=True)
    print(f'wrote {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB)')


main()
