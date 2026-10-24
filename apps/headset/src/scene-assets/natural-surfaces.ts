import {
  BufferGeometry, Color, DataTexture, DoubleSide, Euler, Float32BufferAttribute, Group, LinearFilter,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, Vector3, CylinderGeometry,
} from '@iwsdk/core';
import { makeRandom, alignSpan } from './lib/hardsurface.ts';

/** Original deterministic surfaces. No image requests, DOM, or external asset rights. */
export function surfaceTexture(kind: 'stone' | 'plaster' | 'wood', seed = 18): DataTexture {
  const size = 128, pixels = new Uint8Array(size * size * 4), random = makeRandom(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = kind === 'wood'
      ? Math.sin(y * .62 + Math.sin(x * .05) * 2.8) * 11 + Math.sin(y * 2.5 + x * .02) * 5
      : Math.sin(x * .12 + Math.sin(y * .16)) * 5 + Math.sin(y * .31 + x * .2) * 2;
    const v = Math.round(213 + grain + (random() - .5) * (kind === 'stone' ? 29 : 15));
    const i = (y * size + x) * 4;
    pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v; pixels[i + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.name = `Original-${kind}`;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const shadowPixels = new Uint8Array(32 * 32 * 4);
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  const r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
  const i = (y * 32 + x) * 4;
  shadowPixels[i] = 38; shadowPixels[i + 1] = 43; shadowPixels[i + 2] = 29;
  shadowPixels[i + 3] = Math.round(Math.max(0, 1 - r) ** 1.6 * 128);
}
const shadowMap = new DataTexture(shadowPixels, 32, 32, RGBAFormat);
shadowMap.magFilter = shadowMap.minFilter = LinearFilter; shadowMap.needsUpdate = true;
const shadowMaterial = new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, toneMapped: false });
export function contactShadow(parent: Group, x: number, z: number, width: number, depth: number): void {
  const shadow = new Mesh(new PlaneGeometry(width, depth), shadowMaterial);
  shadow.name = 'SoftContactShadow'; shadow.rotation.x = -Math.PI / 2; shadow.position.set(x, .006, z);
  shadow.userData.iwsdkPreviewBounds = 'exclude'; parent.add(shadow);
}

/** Merged almond-shaped leaves; one draw call, varied normals and color, no sphere canopy. */
export function foliage(seed: number, count: number, radius: number, center: Vector3, leafSize = .12): Mesh {
  const random = makeRandom(seed), positions: number[] = [], colors: number[] = [];
  const palette = [0x536f37, 0x6d8246, 0x829453, 0x365f39, 0xa2ac6b].map(c => new Color(c));
  const transform = new Matrix4(), p = new Vector3();
  const base = [[0, 0, -.65], [-.27, .07, 0], [0, .12, .7], [0, .12, .7], [.27, .07, 0], [0, 0, -.65]];
  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2, height = random() * 2 - 1, r = radius * Math.cbrt(random());
    const rim = Math.sqrt(1 - height * height);
    const x = Math.cos(theta) * rim * r, y = height * r * .72, z = Math.sin(theta) * rim * r;
    transform.makeRotationFromEuler(new Euler(random() * 2.5, theta, random() * 1.3));
    const size = leafSize * (.65 + random() * .8), color = palette[Math.floor(random() * palette.length)]!;
    for (const vertex of base) {
      p.set(vertex[0]! * size, vertex[1]! * size, vertex[2]! * size).applyMatrix4(transform);
      positions.push(p.x + center.x + x, p.y + center.y + y, p.z + center.z + z);
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: .9 }));
  mesh.name = 'IndividualLeaves'; return mesh;
}

export function branch(parent: Group, a: Vector3, b: Vector3, width: number, material: MeshStandardMaterial): void {
  const span = a.distanceTo(b), mesh = new Mesh(new CylinderGeometry(width * .45, width, span, 9), material);
  mesh.name = 'Branch'; alignSpan(mesh, a, b); parent.add(mesh);
}
