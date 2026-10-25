// From the scene lab (apps/gate/.models-cache/scene-lab/scenes/garden.js); run in the app by src/showcase/build.js.
// Garden extras: a small reflective pond with a soil bank and a few lily pads.

export default async ({ THREE, scene, spec, texSet, rng, hold }) => {
  const C = [4.9, -5.6]; // pond centre (x, z)
  const RX = 1.95, RZ = 1.55;
  const outline = (grow) => {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = grow * (1 + 0.07 * Math.sin(a * 3 + 1.3) + 0.045 * Math.sin(a * 5 + 0.4));
      pts.push(new THREE.Vector2(Math.cos(a) * RX * r, Math.sin(a) * RZ * r));
    }
    return pts;
  };
  // the pond is one group around its centre, so it can wait to be named ("there was a pond") and rise in there
  const makePond = () => {
    const pond = new THREE.Group();
    pond.position.set(C[0], 0, C[1]);
    const flat = (mesh, y) => { mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, 0); return mesh; };

    // water: dark and glossy, taking the sky's light (a live mirror draws the whole garden twice, too much for a headset)
    const waterGeo = new THREE.ShapeGeometry(new THREE.Shape(outline(1)), 6);
    const mirror = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: '#1f3a33', roughness: 0.08, metalness: 0.1 }));
    pond.add(flat(mirror, 0.03));
    const tint = new THREE.Mesh(waterGeo, new THREE.MeshBasicMaterial({ color: '#13261f', transparent: true, opacity: 0.5, depthWrite: false }));
    pond.add(flat(tint, 0.034));

    // wet soil bank around the water, so grass does not run straight into it
    const bankShape = new THREE.Shape(outline(1.2));
    bankShape.holes.push(new THREE.Path(outline(0.98)));
    const bankMat = new THREE.MeshStandardMaterial({ color: '#6d6152', roughness: 0.95, ...texSet('farm_soil', [0.7, 0.7]) });
    const bank = flat(new THREE.Mesh(new THREE.ShapeGeometry(bankShape, 6), bankMat), 0.02);
    bank.receiveShadow = true;
    pond.add(bank);

    // lily pads
    const rand = rng(77);
    const padMat = new THREE.MeshStandardMaterial({ color: '#3d6626', roughness: 0.55, side: THREE.DoubleSide });
    const pads = [[0.6, 0.35], [0.9, 0.1], [0.75, -0.3], [-0.9, -0.5], [-1.2, -0.2], [-0.4, 0.7], [1.15, 0.45]];
    for (const [dx, dz] of pads) {
      const r = 0.13 + rand() * 0.1;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 20, rand() * 6.28, Math.PI * 2 - 0.45), padMat.clone());
      pad.material.color.offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(dx, 0.04, dz);
      pad.receiveShadow = true;
      pond.add(pad);
    }
    // two water-lily flowers
    const petal = new THREE.MeshStandardMaterial({ color: '#f4e9ef', roughness: 0.6 });
    for (const [dx, dz] of [[0.62, 0.33], [-1.15, -0.22]]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.06, 8, 1, true), petal);
      f.rotation.x = Math.PI;
      f.position.set(dx, 0.07, dz);
      f.castShadow = true;
      pond.add(f);
    }
    return pond;
  };
  if (hold && spec.items?.some((it) => it.m === '@pond' && it.say)) hold('@pond', makePond);
  else scene.add(makePond());
};
