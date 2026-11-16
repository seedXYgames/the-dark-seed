"""Original patrol sedan, authored in Blender; exports compact meshes for the offline game.
Run in Blender through MCP: exec(compile(open(PATH).read(), PATH, 'exec')).
Coordinates in helpers: x right, y up, z front, in metres (Blender uses z up).
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(globals().get('TDS_PROJECT_ROOT', '/Users/ivan/Desktop/the-dark-seed'))
OUT = ROOT / 'src/render/assets/patrol-car.json'
SOURCE = ROOT / 'assets/blender/patrol-car.blend'
SOURCE.parent.mkdir(parents=True, exist_ok=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
# Work only in our generated scene, preserving any other Blender scenes.
old = bpy.data.scenes.get('Dark Seed Patrol Car')
if old:
    old_objects=list(old.objects)
    bpy.data.scenes.remove(old)
    for obj in old_objects:
        if not obj.users_scene: bpy.data.objects.remove(obj,do_unlink=True)
scene = bpy.data.scenes.new('Dark Seed Patrol Car')
bpy.context.window.scene = scene
parts = {}
def material(name, rgb, metallic=0, rough=.5, emission=0):
    m=bpy.data.materials.get('TDS.'+name) or bpy.data.materials.new('TDS.'+name)
    m.diffuse_color=(*rgb,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1)
    bs.inputs['Metallic'].default_value=metallic;bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*rgb,1);bs.inputs['Emission Strength'].default_value=emission
    return m
mats={
 'paint':material('paint',(.045,.057,.073),.48,.26),
 'white':material('white',(.79,.81,.77),.25,.3),
 'chrome':material('chrome',(.47,.53,.57),.8,.22),
 'rubber':material('rubber',(.018,.022,.027),0,.87),
 'trim':material('trim',(.035,.043,.049),.12,.55),
 'glass':material('glass',(.035,.068,.085),.4,.16),
 'head':material('head',(.94,.94,.85),.1,.18,1.3),
 'tail':material('tail',(.35,.015,.012),.1,.23),
 'red':material('red',(.65,.018,.014),.1,.22,1.5),
 'blue':material('blue',(.025,.12,.75),.1,.22,1.5),
 'amber':material('amber',(.7,.24,.025),.1,.22),
}
def v(p):return (p[0],p[2],p[1])
def keep(obj,name,mat,group=None,bevel=0):
    obj.name=name;obj.data.materials.append(mats[mat]);obj['tds_part']=group or mat
    parts.setdefault(group or mat,[]).append(obj)
    if bevel:
        mod=obj.modifiers.new('Rounded stamped edges','BEVEL');mod.width=bevel;mod.segments=2
        mod.affect='EDGES'
        norm=obj.modifiers.new('Panel normals','WEIGHTED_NORMAL');norm.keep_sharp=True
    return obj

def box(name,p,size,mat,bevel=.015,group=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object
    o.dimensions=v(size);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return keep(o,name,mat,group,bevel)

def cyl(name,p,r,depth,mat,axis='y',verts=24,group=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=v(p))
    o=bpy.context.object
    if axis=='x':o.rotation_euler[1]=math.pi/2
    elif axis=='z':o.rotation_euler[0]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for poly in o.data.polygons: poly.use_smooth=len(poly.vertices)==4
    return keep(o,name,mat,group,.005)

def beam(name,a,b,width,mat,depth=None):
    av,bv=Vector(v(a)),Vector(v(b));d=bv-av
    bpy.ops.mesh.primitive_cube_add(size=1,location=(av+bv)*.5);o=bpy.context.object
    o.dimensions=(width,depth or width,d.length);o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return keep(o,name,mat,bevel=.006)

def hull(name,points,mat,group=None,bevel=.018):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([v(p) for p in points],[],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
    return keep(o,name,mat,group,bevel)

# Long-wheelbase, rounded four-door patrol sedan, within the existing collision envelope.
body=box('Stamped lower body',(0,.67,0),(1.86,.54,4.4),'paint',.07)
# Real wheel arches cut into the body, not painted black rectangles.
for side in [-1,1]:
 for z in [-1.35,1.35]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.405,depth=.55,location=v((side*.88,.37,z)),rotation=(0,math.pi/2,0))
    cut=bpy.context.object
    mod=body.modifiers.new('Wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
    bpy.context.view_layer.objects.active=body
    # Apply bevel first, then the boolean, retaining clean normals in the export.
    for m in list(body.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cut,do_unlink=True)
    cyl('Tyre',(side*.875,.36,z),.35,.245,'rubber','x',32)
    cyl('Alloy wheel',(side*1.003,.36,z),.237,.025,'chrome','x',24)
    cyl('Wheel recess',(side*1.019,.36,z),.19,.012,'trim','x',24)
    cyl('Wheel centre',(side*1.037,.36,z),.085,.025,'chrome','x',16)
    for i in range(8):
      a=i*math.tau/8
      beam('Alloy spoke',(side*1.032,.36+math.cos(a)*.075,z+math.sin(a)*.075),(side*1.032,.36+math.cos(a)*.207,z+math.sin(a)*.207),.032,'chrome',.025)
    for i in range(5):
      a=i*math.tau/5;cyl('Wheel stud',(side*1.057,.36+math.cos(a)*.05,z+math.sin(a)*.05),.011,.008,'trim','x',8)

# Cut the actual luggage cavity so the floor and supplies remain visible with the lid open.
bpy.ops.mesh.primitive_cube_add(size=1,location=v((0,.985,-1.74)))
cut=bpy.context.object;cut.dimensions=v((1.52,.45,.8))
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mod=body.modifiers.new('Open luggage cavity','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cut,do_unlink=True)

# Tapered hood and fenders.
hull('Sloping bonnet',[(-.88,.89,.72),(.88,.89,.72),(.84,.84,2.15),(-.84,.84,2.15),(-.83,1.0,.72),(.83,1.0,.72),(.8,.91,2.15),(-.8,.91,2.15)],'paint',bevel=.028)
for side in [-1,1]:
 beam('Bonnet crease',(side*.54,1.013,.79),(side*.48,.929,2.04),.009,'trim')
 beam('Sill brightwork',(side*.938,.43,-.92),(side*.938,.43,.92),.025,'chrome')
 box('Front door white panel',(side*.94,.72,.21),(.026,.47,1.08),'white',.013)
 box('Rear door white panel',(side*.94,.72,-.69),(.026,.47,.65),'white',.013)
 for z in [.75,-.35,-1.04]:box('Door shut line',(side*.959,.73,z),(.008,.43,.012),'trim',.002)
 for z in [.24,-.68]:
    box('Door handle surround',(side*.967,.922,z),(.025,.07,.19),'trim',.008)
    box('Chrome door handle',(side*.987,.934,z),(.018,.025,.145),'chrome',.008)
 box('Side rubbing strip',(side*.965,.57,-.1),(.02,.035,1.78),'trim',.005)

# Dark, reflective glazing, thin frames and roof with rounded edges.
bottom=[(-.82,.97,-1.25),(.82,.97,-1.25),(.82,.97,.9),(-.82,.97,.9)]
top=[(-.69,1.5,-.88),(.69,1.5,-.88),(.69,1.5,.4),(-.69,1.5,.4)]
hull('Glazing',bottom+top,'glass',bevel=.014)
box('Roof',(0,1.53,-.24),(1.44,.075,1.43),'paint',.04)
for i in range(4):beam('Window pillar',bottom[i],top[i],.055,'paint')
for side in [-1,1]:
 beam('B pillar',(side*.825,.98,-.22),(side*.7,1.5,-.25),.067,'paint')
 beam('Lower window chrome',(side*.835,.978,-1.2),(side*.835,.978,.85),.022,'chrome')
 beam('Mirror arm',(side*.83,1.04,.73),(side*1.04,1.04,.73),.04,'trim')
 box('Mirror housing',(side*1.05,1.08,.72),(.17,.13,.25),'paint',.035)
 box('Mirror glass',(side*1.052,1.08,.586),(.12,.085,.015),'chrome',.012)
 beam('Windscreen wiper',(side*.51,1.006,.91),(side*.15,1.12,.79),.015,'trim')

# Open luggage well: the separate animated lid is exported in hinge coordinates.
box('Trunk well',(0,.794,-1.74),(1.55,.025,.83),'trim',.008)
for side in [-1,1]:box('Rear fender',(side*.82,.88,-1.76),(.13,.2,.89),'paint',.025)
box('Rear luggage rail',(0,.88,-2.18),(1.7,.2,.06),'paint',.015)
box('Trunk front rail',(0,.88,-1.29),(1.7,.2,.04),'paint',.008)
box('Separate trunk lid',(0,.975,-1.75),(1.68,.065,.9),'paint',.022,group='trunk')
box('Trunk lock',(0,.97,-2.214),(.14,.035,.015),'chrome',.006,group='trunk')

# Front and rear bumpers; inset radiator and optical headlamp assemblies.
for z in [-2.23,2.23]:
 box('Bumper',(0,.4,z),(1.86,.15,.16),'chrome',.035)
 box('Bumper rubber',(0,.43,z+(.09 if z>0 else -.09)),(1.72,.055,.025),'trim',.008)
box('Radiator surround',(0,.7,2.218),(.87,.27,.04),'chrome',.025)
box('Radiator shadow',(0,.7,2.244),(.81,.215,.018),'trim',.008)
for i in range(9):box('Grille slat',(-.36+i*.09,.7,2.259),(.012,.18,.015),'chrome',.003)
for side in [-1,1]:
 box('Lamp bezel',(side*.635,.69,2.22),(.38,.25,.04),'chrome',.025)
 for j in [-1,1]:
    x=side*.635+j*.09
    cyl('Headlight bezel',(x,.69,2.251),.086,.025,'trim','z',20)
    cyl('Headlight optic',(x,.69,2.27),.072,.018,'head','z',20,group='head')
    for n in [-1,0,1]:box('Lens rib',(x+n*.027,.69,2.283),(.004,.105,.004),'white',.001,group='head')
 box('Indicator',(side*.86,.55,2.229),(.105,.075,.023),'amber',.012)
 box('Rear lamp surround',(side*.64,.72,-2.225),(.4,.19,.04),'trim',.018)
 box('Rear lamp',(side*.64,.72,-2.252),(.34,.135,.022),'tail',.012)
 box('Reversing lens',(side*.51,.72,-2.269),(.055,.095,.01),'white',.004)
 beam('Push bar upright',(side*.44,.34,2.38),(side*.44,.99,2.39),.067,'trim')
beam('Push bar cross rail',(-.47,.73,2.39),(.47,.73,2.39),.064,'trim')
beam('Push bar lower rail',(-.47,.46,2.39),(.47,.46,2.39),.064,'trim')
box('Front plate bracket',(0,.405,2.405),(.39,.19,.026),'trim',.012)
box('Rear plate recess',(0,.56,-2.247),(.4,.21,.025),'trim',.012)

# Lightbar: separate red and blue circuits, physical housings, siren and radio antenna.
for side in [-1,1]:box('Lightbar foot',(side*.4,1.603,-.25),(.13,.09,.24),'trim',.012)
box('Lightbar chassis',(0,1.65,-.25),(1.27,.06,.32),'chrome',.02)
for side,mat in [(-1,'red'),(1,'blue')]:
 box('Emergency lens',(side*.36,1.738,-.25),(.52,.14,.29),mat,.045,group=mat)
 for z in [-.405,-.095]:
    for xoff in [-.16,0,.16]:box('Lightbar optic',(side*.36+xoff,1.737,z),(.065,.085,.014),mat,.008,group=mat)
box('Siren grille',(0,1.735,-.25),(.17,.12,.29),'trim',.015)
for i in range(4):box('Siren slot',(-.055+i*.037,1.735,-.403),(.013,.065,.005),'chrome',.002)
beam('Radio aerial',(.45,1.57,-.79),(.47,2.02,-.88),.008,'trim')
cyl('Searchlight',(-.91,1.09,.78),.073,.14,'chrome','z',20)
cyl('Searchlight lens',(-.91,1.09,.854),.06,.012,'glass','z',20)

# Export mesh buffers with modifiers applied, including rounded edges and weighted normals.
# Babylon's left-handed coordinates are obtained by swapping Blender Y/Z.
deps=bpy.context.evaluated_depsgraph_get();result={};triangles=0
for group,objects in parts.items():
    pos=[];norm=[];indices=[];lookup={}
    for obj in objects:
        ev=obj.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
        mat=obj.matrix_world
        normalmat=mat.to_3x3().inverted().transposed()
        for tri in me.loop_triangles:
            for li in tri.loops:
                loop=me.loops[li];p=mat@me.vertices[loop.vertex_index].co;n=(normalmat@loop.normal).normalized()
                xx,yy,zz=p.x,p.z,p.y
                if group=='trunk':yy-=.95;zz+=1.3
                key=tuple(round(q,5) for q in [xx,yy,zz,n.x,n.z,n.y])
                idx=lookup.get(key)
                if idx is None:
                    idx=len(pos)//3;lookup[key]=idx;pos.extend(key[:3]);norm.extend(key[3:])
                indices.append(idx)
            triangles+=1
        ev.to_mesh_clear()
    result[group]={'positions':pos,'normals':norm,'indices':indices}
OUT.write_text(json.dumps({'version':1,'triangles':triangles,'parts':result},separators=(',',':')))
# Save a reusable model, with a comfortable three-quarter view in Blender.
for area in bpy.context.screen.areas:
    if area.type=='CONSOLE': area.type='VIEW_3D'
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=7
        area.spaces.active.region_3d.view_location=(0,0,.85)
        area.spaces.active.clip_end=200
scene.world=bpy.data.worlds.new('Patrol studio')
scene.world.color=(.15,.15,.15)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
print(json.dumps({'export':str(OUT),'source':str(SOURCE),'triangles':triangles,'parts':list(result),'bytes':OUT.stat().st_size}))
