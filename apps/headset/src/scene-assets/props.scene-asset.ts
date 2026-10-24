// Original illustrative props. Meters, Y up, +Z front, base at Y=0.
// These are intentionally stylized fixtures, never reconstructions of a family's possessions.
import { Group, Mesh, CylinderGeometry, SphereGeometry, MeshStandardMaterial, Vector3, TorusGeometry } from '@iwsdk/core';
import { bevelBox, makeRandom } from './lib/hardsurface.ts';
import { branch, foliage } from './natural-surfaces.ts';

const material = (color: number, metalness = 0) => new MeshStandardMaterial({ color, roughness: .76, metalness });
const wood = material(0x987045), darkWood = material(0x533b2d), iron = material(0x303d36, .35);
wood.name = 'MemoryOak'; darkWood.name = 'MemoryWalnut'; iron.name = 'AgedIron';
const cream = material(0xeadfc6), gold = material(0xb49052, .25), green = material(0x74855a), greenDark = material(0x526b49);
const ink = material(0x282c2b), white = material(0xf6ead2), terra = material(0xb37857);
function box(parent: Group, name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat = wood) {
  const mesh = new Mesh(bevelBox(w, h, d, Math.min(w,h,d) * .12), mat); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function cylinder(parent: Group, name: string, top: number, bottom: number, h: number, x: number, y: number, z: number, mat = wood) {
  const mesh = new Mesh(new CylinderGeometry(top, bottom, h, 12), mat); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
export function makeProp(kind: string): Group {
  const root = new Group(); root.name = kind;
  if (kind === 'bench' || kind === 'chair' || kind === 'armchair') {
    const w = kind === 'bench' ? 1.6 : .65;
    for (const x of [-w * .39, w * .39]) for (const z of [-.22, .22]) box(root, 'Leg', .065, .45, .065, x, .225, z, iron);
    for (let i = 0; i < 5; i++) {
      const slat = wood.clone(); slat.name = wood.name; slat.color.multiplyScalar(.88 + i * .045);
      box(root, 'SeatSlat', w, .045, .09, 0, .46, -.22 + i * .11, slat);
    }
    for (const x of [-w * .44, w * .44]) box(root, 'BackSupport', .055, .7, .06, x, .61, -.27, iron);
    for (let i = 0; i < 3; i++) box(root, 'BackSlat', w, .095, .045, 0, .67 + i * .12, -.27);
    if (kind === 'bench') for (const x of [-w * .44, w * .44]) {
      box(root, 'Armrest', .065, .055, .59, x, .71, -.01, darkWood);
      box(root, 'ArmSupport', .035, .23, .035, x, .59, .21, iron);
      for (const y of [.68,.8,.92]) {
        const bolt = new Mesh(new SphereGeometry(.012, 6, 4), iron); bolt.name = 'RecessedBolt'; bolt.position.set(x,y,-.238); root.add(bolt);
      }
    }
    if (kind === 'armchair') {
      box(root, 'SeatCushion', .57, .13, .48, 0, .54, .01, cream);
      box(root, 'BackCushion', .56, .38, .11, 0, .79, -.2, cream);
      for (const x of [-.35, .35]) box(root, 'ArmRest', .11, .12, .6, x, .72, 0, darkWood);
    }
  } else if (kind === 'tree') {
    const random = makeRandom(84);
    branch(root, new Vector3(0,0,0), new Vector3(.08,1.45,-.07), .14, darkWood);
    for (let i=0;i<12;i++) {
      const angle=i*2.399, length=.48+random()*.4, y=1.2+random()*.9;
      const tip=new Vector3(Math.cos(angle)*length,y+.38,Math.sin(angle)*length);
      branch(root,new Vector3(.04,.86+random()*.55,-.02),tip,.038+random()*.025,darkWood);
      root.add(foliage(92+i,140,.47,tip,.16));
    }
    cylinder(root,'Soil',.64,.64,.035,0,.026,0,material(0x504334));
    const rim=new Mesh(new TorusGeometry(.67,.055,6,36),terra); rim.name='TerracottaBedRim';rim.rotation.x=Math.PI/2;rim.position.y=.055;root.add(rim);
  } else if (kind === 'gate') {
    for (const x of [-.9,.9]) { box(root,'StonePost',.22,1.8,.28,x,.9,0,cream); box(root,'PostCap',.29,.09,.34,x,1.84,0,gold); }
    const hinge = new Group(); hinge.name = 'GateHinge'; hinge.position.set(-.76,.16,0); root.add(hinge);
    for (let i=0;i<8;i++) {
      const plank=wood.clone();plank.name=wood.name;plank.color.setHex(i%2 ? 0x697969 : 0x73816c);
      box(hinge,'GatePlank',.177,1.25,.065,.095+i*.19,.625,0,plank);
    }
    for (const y of [.3,.96]) box(hinge,'IronBrace',1.48,.07,.09,.76,y,.045,iron);
    cylinder(hinge,'Latch',.045,.045,.12,1.39,.66,.07,gold).rotation.x=Math.PI/2;
  } else if (kind === 'photograph') {
    box(root,'Frame',.48,.36,.055,0,.23,0,darkWood);
    box(root,'Mat',.43,.31,.014,0,.23,.035,cream);
    box(root,'Illustration',.36,.24,.01,0,.23,.045,terra);
    const sun = new Mesh(new SphereGeometry(.04,12,8),gold); sun.name='IllustrationSun';sun.position.set(.1,.29,.055);root.add(sun);
    box(root,'Stand',.045,.16,.22,0,.08,-.055,wood);
  } else if (kind === 'piano') {
    box(root,'Cabinet',1.42,1.05,.36,0,.67,-.12,darkWood);
    box(root,'KeyboardBed',1.42,.12,.54,0,.62,.12);
    for(let i=0;i<30;i++) box(root,'IvoryKey',.041,.032,.26,-.64+i*.044,.7,.25,white);
    for(let i=0;i<20;i++) if(i%3!==0) box(root,'BlackKey',.024,.028,.14,-.61+i*.063,.728,.18,ink);
    for(const x of [-.6,.6]) box(root,'FrontLeg',.09,.6,.09,x,.3,.31,darkWood);
    box(root,'TopLid',1.5,.07,.45,0,1.23,-.12);
  } else if (kind === 'radio') {
    box(root,'Cabinet',.55,.4,.23,0,.22,0,darkWood);
    box(root,'Speaker',.4,.25,.018,-.025,.24,.125,cream);
    for(let i=0;i<8;i++) box(root,'Grille',.33,.012,.02,-.025,.135+i*.029,.139,wood);
    for(const x of [-.18,.18]) cylinder(root,'Dial',.035,.035,.03,x,.075,.14,gold).rotation.x=Math.PI/2;
  } else if (kind === 'lamp') {
    cylinder(root,'Base',.16,.19,.045,0,.023,0,gold);
    cylinder(root,'Stem',.018,.025,.48,0,.26,0,darkWood);
    cylinder(root,'Shade',.15,.26,.28,0,.58,0,cream);
  } else if (kind === 'clock') {
    box(root,'ClockBody',.44,.4,.15,0,.24,0,darkWood); box(root,'Foot',.5,.08,.2,0,.04,0);
    const face=cylinder(root,'ClockFace',.16,.16,.018,0,.26,.09,cream);face.rotation.x=Math.PI/2;
    box(root,'HourHand',.014,.1,.015,0,.3,.11,ink);
    const hand=box(root,'MinuteHand',.1,.012,.015,.045,.26,.11,ink);hand.rotation.z=.3;
  } else if (kind === 'rug') {
    box(root,'WovenRug',1.8,.018,1.25,0,.009,0,terra);
    for(const x of [-.81,.81]) box(root,'Border',.045,.004,1.1,x,.021,0,gold);
    for(const z of [-.53,.53]) box(root,'Border',1.66,.004,.04,0,.021,z,gold);
  } else {
    const body=new Mesh(new SphereGeometry(.15,16,12),cream);body.name='TeapotBody';body.scale.y=.8;body.position.y=.14;root.add(body);
    cylinder(root,'Lid',.1,.12,.035,0,.265,0,gold);
    const spout=cylinder(root,'Spout',.028,.055,.18,.17,.18,0,cream);spout.rotation.z=-.8;
    cylinder(root,'Foot',.09,.1,.025,0,.012,0,gold);
  }
  return root;
}

export const PROP_SIZES: Record<string, number> = {
  bench: 1.6, tree: 2.9, gate: 2, photograph: .48, chair: .86, armchair: .98,
  piano: 1.5, radio: .55, lamp: .72, clock: .5, rug: 1.8, teapot: .35,
};
