// Original Blender-authored patrol sedan. Buffers are bundled: no runtime asset request or loader.
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import data from './assets/patrol-car.json';
import type { CarBuilt, CarOpts } from './vehicles';
import { type Ctx, makeCanvasTexture, texPlane } from './meshUtil';

export function patrolPart(c: Ctx, parent: TransformNode, part: keyof typeof data.parts, mat: StandardMaterial): Mesh {
  const p = data.parts[part], mesh = new Mesh('patrol.' + part, c.scene), vd = new VertexData();
  vd.positions = p.positions; vd.normals = p.normals; vd.indices = p.indices;
  vd.applyToMesh(mesh); mesh.material = mat; mesh.parent = parent;
  mesh.isPickable = false; mesh.receiveShadows = true;
  return mesh;
}

export function buildPatrolCar(c: Ctx, parent: TransformNode, o: CarOpts): CarBuilt {
  const meshes: Mesh[] = [], own: StandardMaterial[] = [];
  const palette: Record<string, [number, number, number]> = {
    paint: [0x151b23, 0.3, 80], white: [0xc9cfcd, 0.22, 64], chrome: [0x87959d, 0.65, 96],
    rubber: [0x080a0d, 0.015, 12], trim: [0x0d1116, 0.06, 24], glass: [0x101f29, 0.65, 128],
    amber: [0xad5918, 0.16, 60], tail: [0x63100d, 0.24, 64], red: [0x4c1012, 0.2, 64], blue: [0x0d255c, 0.24, 64],
  };
  const partMap: Record<string, Mesh> = {};
  for (const [part, [hex, spec, gloss]] of Object.entries(palette)) {
    const mat = c.mats.make('patrol.' + part, hex, 0, { spec }); mat.specularPower = gloss; own.push(mat);
    const mesh = patrolPart(c, parent, part as keyof typeof data.parts, mat);
    if (!['red', 'blue', 'glass'].includes(part)) c.shadow(mesh);
    meshes.push(mesh); partMap[part] = mesh;
  }
  const head = patrolPart(c, parent, 'head', c.mats.bulbOff); meshes.push(head);
  const texture = (name: string, width: number, height: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const mat = c.mats.make('patrol.' + name, 0xffffff); mat.specularPower = 48;
    mat.diffuseTexture = makeCanvasTexture(c.scene, 'patrol.' + name, width, height, draw);
    own.push(mat); return mat;
  };
  const decal = texture('decal', 512, 192, (x, w, h) => {
    x.fillStyle = '#c9cfcd'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#172b3f'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 26px Arial'; x.fillText('MOUNTAIN COUNTY', w / 2, 29);
    x.font = 'bold 83px Arial'; x.fillText('POLICE', w / 2, 91);
    x.fillStyle = '#526578'; x.fillRect(32, 146, 132, 3); x.fillRect(w - 164, 146, 132, 3);
    x.font = 'bold 23px Arial'; x.fillText(o.unit, w / 2, 157);
  });
  for (const side of [-1, 1]) {
    const p = texPlane(c.scene, 'patrol.decal', 0.94, 0.36, decal, parent);
    p.position.set(side * 0.956, 0.732, 0.21); p.rotation.y = side * Math.PI / 2; meshes.push(p);
  }
  const plate = texture('plate', 256, 112, (x, w, h) => {
    x.fillStyle = '#dadbd0'; x.fillRect(0, 0, w, h); x.strokeStyle = '#273b4c'; x.lineWidth = 5; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#26394c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 18px Arial'; x.fillText('MOUNTAIN COUNTY', w / 2, 24);
    x.font = 'bold 43px monospace'; x.fillText(o.plate, w / 2, 70);
  });
  for (const front of [true, false]) {
    const p = texPlane(c.scene, 'patrol.plate', 0.34, 0.15, plate, parent);
    p.position.set(0, front ? 0.405 : 0.56, front ? 2.422 : -2.265); p.rotation.y = front ? 0 : Math.PI; meshes.push(p);
  }
  return { meshes, head, own, beacons: { red: partMap.red, blue: partMap.blue } };
}

export function buildPatrolTrunk(c: Ctx, parent: TransformNode): Mesh {
  const mat = c.mats.make('patrol.trunkPaint', 0x151b23, 0, { spec: 0.3 }); mat.specularPower = 80;
  const mesh = patrolPart(c, parent, 'trunk', mat); c.shadow(mesh); return mesh;
}
