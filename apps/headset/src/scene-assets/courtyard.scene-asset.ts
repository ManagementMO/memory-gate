import {
  BackSide, BoxGeometry, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute,
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Path, PlaneGeometry, Shape, SphereGeometry, Vector3,
} from '@iwsdk/core';
import { bevelBox, makeRandom } from './lib/hardsurface.ts';
import { branch, contactShadow, foliage, surfaceTexture } from './natural-surfaces.ts';

/** Original garden interpretation, in meters. Open foreground; spoken props stay independently editable. */
export function makeCourtyard(): Group {
  const root = new Group(); root.name = 'IllustrativeCourtyard';
  const random = makeRandom(52), stoneMap = surfaceTexture('stone'), plasterMap = surfaceTexture('plaster');
  const plaster = new MeshStandardMaterial({ color: 0xd9cfb5, map: plasterMap, bumpMap: plasterMap, bumpScale: .016, roughness: .96 });
  const stone = new MeshStandardMaterial({ color: 0xb4aa91, map: stoneMap, bumpMap: stoneMap, bumpScale: .012, roughness: .98 });
  const wood = new MeshStandardMaterial({ color: 0x6b5841, roughness: .94 });
  const clay = new MeshStandardMaterial({ color: 0xa46c4e, roughness: .94 });
  const shutter = new MeshStandardMaterial({ color: 0x596b55, roughness: .86 });
  const dark = new MeshStandardMaterial({ color: 0x293b32, roughness: 1 });
  const cube = new BoxGeometry(1,1,1);
  const blocks = new Map<MeshStandardMaterial, { name: string; matrix: Matrix4 }[]>();
  const block = (name: string, w: number,h: number,d: number,x: number,y: number,z: number,m=plaster) => {
    const matrix=new Matrix4().makeScale(w,h,d);matrix.setPosition(x,y,z);
    const batch=blocks.get(m) ?? [];batch.push({name,matrix});blocks.set(m,batch);
  };
  const skyGeometry = new SphereGeometry(38,24,12), skyColors: number[]=[];
  const position=skyGeometry.getAttribute('position'), high=new Color(0x91b6bf), horizon=new Color(0xe8e3ce);
  for(let i=0;i<position.count;i++) {
    const t=Math.max(0,Math.min(1,position.getY(i)/30)), c=horizon.clone().lerp(high,t);skyColors.push(c.r,c.g,c.b);
  }
  skyGeometry.setAttribute('color',new Float32BufferAttribute(skyColors,3));
  const sky=new Mesh(skyGeometry,new MeshBasicMaterial({side:BackSide,vertexColors:true,depthWrite:false}));
  sky.name='GardenSky';sky.userData.iwsdkPreviewBounds='exclude';root.add(sky);
  block('LimestoneSubfloor',14,.08,16,0,-.075,-3.8,stone);
  // Smaller staggered limestone pavers, with narrow joints and real surface variation.
  for(let tone=0;tone<5;tone++) {
    const points: [number,number][]=[];
    for(let x=0;x<15;x++) for(let z=0;z<24;z++) if((x*7+z*3)%5===tone) points.push([x,z]);
    const m=stone.clone();m.color.multiplyScalar(.92+tone*.035);
    const paving=new InstancedMesh(bevelBox(.914,.065,.615,.009),m,points.length);
    paving.name='LimestonePaving';const matrix=new Matrix4();
    points.forEach(([x,z],index)=>{matrix.makeTranslation(-6.6+x*.925+(z%2)*.46,-.033,3-z*.625);paving.setMatrixAt(index,matrix);});
    paving.instanceMatrix.needsUpdate=true;root.add(paving);
  }
  // An actual opening behind the independently articulated gate.
  const wallShape=new Shape();wallShape.moveTo(-6.7,0);wallShape.lineTo(6.7,0);wallShape.lineTo(6.7,2.65);wallShape.lineTo(-6.7,2.65);wallShape.closePath();
  const opening=new Path();opening.moveTo(-1.02,0);opening.lineTo(-1.02,1.62);opening.absarc(0,1.62,1.02,Math.PI,0,true);opening.lineTo(1.02,0);opening.closePath();wallShape.holes.push(opening);
  const back=new Mesh(new ExtrudeGeometry(wallShape,{depth:.27,bevelEnabled:false,curveSegments:20}),plaster);
  back.name='ArchedGardenWall';back.position.z=-8.95;root.add(back);
  block('WallCoping',13.6,.11,.4,0,2.71,-8.83,stone);
  for(const x of [-6.65,6.65]) {
    block('SideWall',.25,2.15,13.3,x,1.075,-2.2);
    block('SideCoping',.37,.11,13.4,x,2.2,-2.2,stone);
    block('LowGardenBed',.72,.3,9.9,x*.91,.15,-3.3,stone);
    block('GardenSoil',.64,.025,9.7,x*.91,.31,-3.3,new MeshStandardMaterial({color:0x554b37,roughness:1}));
  }
  block('HouseFacade',15,3.5,.4,0,3.45,-11,plaster);
  block('HouseCornice',15.2,.14,.58,0,5.23,-10.95,stone);
  for(const x of [-4.5,-1.65,1.65,4.5]) {
    block('WindowRecess',.92,1.35,.05,x,3.8,-10.77,dark);
    block('WindowSill',1.13,.1,.42,x,3.08,-10.6,stone);
    for(const side of [-1,1]) {
      block('ShutterFrame',.48,1.43,.07,x+side*.64,3.8,-10.68,shutter);
      for(let i=0;i<9;i++) block('ShutterSlat',.4,.085,.09,x+side*.64,3.23+i*.14,-10.61,shutter);
    }
  }
  // The pergola gives the garden human scale and shade; the foreground remains open.
  for(const x of [-5.8,-3.15]) for(const z of [-1.3,-7.6]) {
    block('PergolaFoot',.27,.16,.27,x,.08,z,stone);block('PergolaPost',.15,2.75,.15,x,1.52,z,wood);
  }
  for(const x of [-5.8,-3.15]) block('PergolaBeam',.16,.21,6.8,x,2.94,-4.45,wood);
  for(let i=0;i<12;i++) block('PergolaRafter',3.15,.13,.12,-4.47,3.08,-1.2-i*.59,wood);
  const shadeMat=new MeshBasicMaterial({color:0x3c4935,transparent:true,opacity:.1,depthWrite:false});
  for(let i=0;i<12;i++) {
    const shadow=new Mesh(new PlaneGeometry(2.65,.11),shadeMat);shadow.name='PergolaShade';shadow.rotation.x=-Math.PI/2;shadow.position.set(-4.1,.009,-1.2-i*.59);root.add(shadow);
  }
  for(let i=0;i<7;i++) root.add(foliage(200+i,95,.53,new Vector3(-4.45+Math.sin(i)*.65,3.1,-1.5-i*.87),.17));
  // An ordinary side table supports the practice keepsake. It is set dressing, never claimed as spoken evidence.
  block('KeepsakeTableTop',.75,.07,.54,-.55,1.015,-.85,wood);
  for(const x of [-.84,-.26]) for(const z of [-1.03,-.67]) block('KeepsakeTableLeg',.05,.98,.05,x,.49,z,wood);
  for(const x of [-6.02,6.02]) for(let i=0;i<10;i++) root.add(foliage(400+i+(x>0?40:0),90,.42,new Vector3(x,.61,.7-i*.9),.14));
  for(const [x,z] of [[5.15,-2.5],[4.9,-7.2],[-5.9,.65]] as const) {
    const pot=new Mesh(new CylinderGeometry(.31,.22,.48,24),clay);pot.name='TerracottaPlanter';pot.position.set(x,.24,z);root.add(pot);
    root.add(foliage(Math.floor((x+8)*100),230,.5,new Vector3(x,.98,z),.14));contactShadow(root,x,z,1.15,1.15);
  }
  for(const [x,z] of [[-9,-12],[8,-12],[-9,-6],[9,-5]] as const) {
    const bark=wood.clone();bark.color.setHex(0x5e5a43);
    branch(root,new Vector3(x,0,z),new Vector3(x+.2,4.7,z),.2,bark);
    root.add(foliage(600+Math.floor(random()*100),650,2.1,new Vector3(x,4.9,z),.24));
  }
  for(const [material,items] of blocks) {
    const batch=new InstancedMesh(cube,material,items.length);batch.name=`Architecture-${items[0]!.name}`;
    items.forEach((item,index)=>batch.setMatrixAt(index,item.matrix));batch.instanceMatrix.needsUpdate=true;
    batch.userData.partNames=items.map(item=>item.name);root.add(batch);
  }
  return root;
}
