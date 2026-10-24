import { Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardMaterial, InstancedMesh, Matrix4 } from '@iwsdk/core';

/** Original illustrative set, open foreground, with no baked-in interactive props. */
export function makeCourtyard(): Group {
  const root = new Group(); root.name = 'IllustrativeCourtyard';
  const stone = new MeshStandardMaterial({ color: 0xc9b697, roughness: .95 });
  const cap = new MeshStandardMaterial({ color: 0xe3d3b8, roughness: .88 });
  const clay = new MeshStandardMaterial({ color: 0x986a4a, roughness: .9 });
  const tile = [0xbba789,0xc9b99c,0xc4b193,0xb5a283].map(color => new MeshStandardMaterial({ color, roughness: .94 }));
  const cube = new BoxGeometry(1,1,1);
  const block = (name: string, w: number,h: number,d: number,x: number,y: number,z: number,m=stone) => {
    const mesh=new Mesh(cube,m);mesh.name=name;mesh.scale.set(w,h,d);mesh.position.set(x,y,z);root.add(mesh);return mesh;
  };
  for(let tone=0;tone<4;tone++) {
    const points: [number,number][]=[];
    for(let x=0;x<10;x++) for(let z=0;z<10;z++) if((x*7+z*3)%4===tone) points.push([x,z]);
    const paving=new InstancedMesh(new BoxGeometry(1.36,.1,1.36),tile[tone]!,points.length);
    paving.name='Paving';const matrix=new Matrix4();
    points.forEach(([x,z],index)=> { matrix.makeTranslation(-6.3+x*1.4,-.06,2.5-z*1.4);paving.setMatrixAt(index,matrix); });
    paving.instanceMatrix.needsUpdate=true;root.add(paving);
  }
  block('BackWall',14,2.7,.3,0,1.35,-10);
  for(const x of [-7,7]) { block('SideWall',.3,2.7,13.2,x,1.35,-3.5); block('Coping',.45,.13,13.4,x,2.75,-3.5,cap); }
  block('BackCoping',14.2,.13,.45,0,2.75,-10,cap);
  for(const x of [-5.6,-2.8,0,2.8,5.6]) {
    block('Pillar',.38,3,.5,x,1.5,-9.75,cap);
    block('PillarCap',.5,.13,.64,x,3.03,-9.75,clay);
  }
  for(const x of [-6.1,6.1]) for(const z of [-2,-5.6,-8.5]) {
    const pot=new Mesh(new CylinderGeometry(.32,.23,.46,16),clay);pot.name='TerracottaPot';pot.position.set(x,.23,z);root.add(pot);
    block('PlanterShrub',.55,.45,.55,x,.67,z,new MeshStandardMaterial({ color:0x687a50,roughness:1 }));
  }
  return root;
}
