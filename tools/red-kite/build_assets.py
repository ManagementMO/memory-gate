"""Original project-owned Red Kite meshes. Run in a new background Blender process.
No network, paid generation, add-on or modification of an existing GUI document.
"""
import argparse
import hashlib
import json
import math
import pathlib
import random
import sys

import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument('--output', type=pathlib.Path, default=ROOT / 'apps/gate/public/red-kite/models')
args.add_argument('--source', type=pathlib.Path, default=ROOT / 'assets/red-kite/source')
opts = args.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
opts.output.mkdir(parents=True, exist_ok=True)
opts.source.mkdir(parents=True, exist_ok=True)


def material(name, color, roughness=.75, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*color, 1)
    return m


paper = material('KitePaper', (.78, .72, .57), .93)
bamboo = material('Bamboo', (.46, .30, .12), .74)
thread = material('NaturalString', (.60, .52, .35), .96)
ribbon = material('CreamRibbon', (.82, .77, .61), .94)
wood = material('WarmWood', (.32, .16, .065), .72)
endgrain = material('WoodEndgrain', (.40, .23, .10), .85)
brass = material('AgedBrass', (.34, .25, .10), .48, .55)
card = material('StorySurface', (.87, .83, .69), .96)
red = material('KiteEmblem', (.48, .055, .03), .9)


def surface_texture(name, mat, woodgrain=False):
    # Original tiny baked color textures survive core glTF export; no external texture dependencies.
    size, rng = 128, random.Random(72 if woodgrain else 19)
    img = bpy.data.images.new(name, width=size, height=size)
    pixels = []
    base = mat.node_tree.nodes.get('Principled BSDF')
    pigment = tuple(base.inputs['Base Color'].default_value) if woodgrain else (1, 1, 1, 1)
    for y in range(size):
        for x in range(size):
            noise = rng.uniform(-.025, .025)
            grain = math.sin(x*.72 + math.sin(y*.07)*1.5) * (.07 if woodgrain else .008)
            crease = max(0, 1 - abs(x-y)/2.5) * (.018 if not woodgrain else 0)
            value = max(.65, min(1, .93 + noise + grain - crease))
            pixels.extend((value* pigment[0], value* pigment[1], value* pigment[2], 1))
    img.pixels = pixels
    img.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    # A direct baked texture exports reliably to glTF. Runtime pigment multiplies the neutral paper.
    mat.node_tree.links.new(tex.outputs['Color'], base.inputs['Base Color'])


surface_texture('PaperFibers', paper)
surface_texture('WoodGrain', wood, True)
surface_texture('EndGrain', endgrain, True)


def empty(name, parent=None, location=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    o.location = location
    return o


def mesh(name, vertices, faces, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    uv = data.uv_layers.new(name='SurfaceUV')
    xs, zs = [v[0] for v in vertices], [v[2] for v in vertices]
    dx, dz = max(xs)-min(xs), max(zs)-min(zs)
    for p in data.polygons:
        for loop in p.loop_indices:
            v = vertices[data.loops[loop].vertex_index]
            uv.data[loop].uv = ((v[0]-min(xs))/(dx or 1), (v[2]-min(zs))/(dz or 1))
    data.materials.append(mat)
    data.update()
    o = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


def cube(name, size, location, mat, parent, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    o.parent = parent
    o.location = location
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('SoftenedEdges', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def rod(name, a, b, radius, mat, parent, vertices=16):
    a, b = Vector(a), Vector(b)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length)
    o = bpy.context.object
    o.name = name
    o.parent = parent
    o.location = (a + b) / 2
    o.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        if len(p.vertices) == 4:
            p.use_smooth = True
    return o


def cord(name, points, radius, mat, parent):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth, c.bevel_resolution = radius, 0
    s = c.splines.new('POLY')
    s.points.add(len(points) - 1)
    for p, xyz in zip(s.points, points):
        p.co = (*xyz, 1)
    o = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(mat)
    return o


def kite(root):
    sail = mesh('KiteSail', [(0, -.022, .05), (-.34, 0, .12), (0, 0, .48), (.34, 0, .12), (0, 0, -.38)],
                [(0, 2, 1), (0, 3, 2), (0, 1, 4), (0, 4, 3)], paper, root)
    solid = sail.modifiers.new('PaperThickness', 'SOLIDIFY')
    solid.thickness = .0012
    bpy.context.view_layer.objects.active = sail
    bpy.ops.object.modifier_apply(modifier=solid.name)
    frame = empty('KiteFrame', root)
    rod('VerticalSpar', (0, .007, -.38), (0, .007, .48), .004, bamboo, frame)
    cord('BowedCrossSpar', [(-.34 + .68*i/20, .008 + .014*math.sin(math.pi*i/20), .12) for i in range(21)], .0038, bamboo, frame)
    for i, (a, b) in enumerate([((0, 0, .48), (-.34, 0, .12)), ((-.34, 0, .12), (0, 0, -.38)), ((0, 0, -.38), (.34, 0, .12)), ((.34, 0, .12), (0, 0, .48))]):
        rod('EdgeBinding_%02d' % i, a, b, .0011, thread, root, 8)
    anchor = (0, -.105, .045)
    empty('StringAnchor', root, anchor)
    empty('BridleAnchor', root, anchor)
    cord('Bridle', [(-.21, -.005, .12), anchor, (.21, -.005, .12)], .0012, thread, root)
    tail = empty('TailRoot', root, (0, 0, -.38))
    for i in range(9):
        segment = empty('Tail_%02d' % i, tail, (0, 0, 0 if i == 0 else -.12))
        segment.rotation_euler[1] = math.sin(i*.9)*.12
        # The glTF material is double sided; coincident reverse faces are invalid geometry.
        mesh('Ribbon_%02d' % i, [(-.021, 0, 0), (.021, 0, 0), (.018, -.003, -.12), (-.018, -.003, -.12)], [(0, 3, 2, 1)], ribbon, segment)
        tail = segment


def spool(root):
    rod('SpoolBody', (-.075, 0, 0), (.075, 0, 0), .028, wood, root, 32)
    for x in [-.078, .078]:
        rod('EndCap', (x-.007, 0, 0), (x+.007, 0, 0), .054, endgrain, root, 40)
        rod('EndPin', (x-.008, 0, 0), (x+.008, 0, 0), .009, brass, root, 20)
    rod('WoundString', (-.062, 0, 0), (.062, 0, 0), .036, thread, root, 40)
    cord('StringWinding', [(-.061 + .122*i/256, .037*math.sin(i/256*math.pi*64), .037*math.cos(i/256*math.pi*64)) for i in range(257)], .0013, ribbon, root)
    empty('StringExit', root, (0, -.038, .01))


def table(root):
    cube('TableTop', (.65, .45, .025), (0, 0, .75), wood, root, .008)
    cube('TableEdge', (.61, .41, .014), (0, 0, .731), endgrain, root, .004)
    for x in [-.25, .25]:
        rod('FoldingLeg', (x, -.19, .02), (x, .17, .72), .017, wood, root)
        rod('FoldingLeg', (x, .19, .02), (x, -.17, .72), .017, wood, root)
        rod('HingePin', (x-.025, 0, .37), (x+.025, 0, .37), .009, brass, root)
    rod('Brace', (-.25, -.15, .16), (.25, -.15, .16), .012, endgrain, root)
    empty('SupportTop', root, (0, 0, .764))


def box(root):
    cube('BoxFloor', (.26, .18, .012), (0, 0, .006), wood, root, .003)
    for x in [-.123, .123]:
        cube('BoxSide', (.014, .18, .075), (x, 0, .046), wood, root, .002)
    for y in [-.083, .083]:
        cube('BoxEnd', (.232, .014, .075), (0, y, .046), endgrain, root, .002)
    pivot = empty('LidPivot', root, (0, .083, .086))
    cube('BoxLid', (.264, .184, .013), (0, -.083, .0065), wood, pivot, .004)
    cube('LidInset', (.23, .15, .002), (0, -.083, .014), endgrain, pivot, .002)
    for x in [-.075, .075]:
        rod('LidHinge', (x-.013, .083, .086), (x+.013, .083, .086), .005, brass, root)
    empty('StoryCardDock', root, (0, 0, .024))


def story_card(root):
    cube('StoryCard', (.15, .002, .10), (0, 0, .05), card, root, .001)
    mesh('KiteEmblem', [(0, -.0015, .077), (-.016, -.0015, .056), (0, -.0015, .026), (.016, -.0015, .056)], [(0, 1, 2, 3)], red, root)
    cord('EmblemTail', [(0, -.002, .026), (.005, -.002, .018), (-.003, -.002, .012)], .0007, bamboo, root)


manifest = {'schema': 'memory-gate.red-kite-assets/1', 'units': 'meters', 'front': '+Z', 'blenderVersion': bpy.app.version_string,
            'source': 'Original project-authored geometry and core glTF PBR materials', 'assets': []}
first_scene = None
for key, root_name, build in [('kite', 'KiteRoot', kite), ('spool', 'SpoolRoot', spool), ('side-table', 'SupportRoot', table), ('keepsake-box', 'KeepsakeRoot', box), ('story-card', 'StoryCardRoot', story_card)]:
    scene = bpy.data.scenes.new('RedKite_' + key)
    bpy.context.window.scene = scene
    first_scene = first_scene or scene
    root = empty(root_name)
    build(root)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    target = opts.output / (key + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True, use_active_scene=True, export_yup=True, export_animations=False)
    vertices, triangles = [], 0
    deps = bpy.context.evaluated_depsgraph_get()
    for o in scene.objects:
        if o.type not in {'MESH', 'CURVE'}:
            continue
        evaluated = o.evaluated_get(deps)
        geom = evaluated.to_mesh()
        triangles += sum(len(p.vertices)-2 for p in geom.polygons)
        for v in geom.vertices:
            p = evaluated.matrix_world @ v.co
            vertices.append((p.x, p.z, -p.y))
        evaluated.to_mesh_clear()
    mins = [min(v[i] for v in vertices) for i in range(3)]
    maxs = [max(v[i] for v in vertices) for i in range(3)]
    raw = target.read_bytes()
    manifest['assets'].append({'key': key, 'file': 'models/' + target.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'triangles': triangles, 'boundsMeters': {'min': mins, 'max': maxs}, 'librarySize': max(maxs[i]-mins[i] for i in range(3)),
        'nodes': [o.name for o in scene.objects], 'materialCount': len({slot.material.name for o in scene.objects for slot in o.material_slots if slot.material}),
        'source': 'Original Blender Python build; project-owned', 'clips': []})
bpy.context.window.scene = first_scene
bpy.ops.wm.save_as_mainfile(filepath=str(opts.source / 'red-kite-assets.blend'), compress=True)
(opts.output.parent / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('RED_KITE_ASSETS', json.dumps({'assets': len(manifest['assets']), 'triangles': sum(a['triangles'] for a in manifest['assets']), 'bytes': sum(a['bytes'] for a in manifest['assets'])}))
