/** Optional props are small illustrations, never geographic reconstruction. */
export const MEMORY_ASSETS = {
  bridge: { label: 'Arched footbridge', url: '/memory-objects/bridge.glb', size: 1.25 },
  bench: { label: 'Wooden park bench', url: '/memory-objects/bench.glb', size: .9 },
  flower: { label: 'Flower planter', url: '/memory-objects/flower.glb', size: .55 },
  kite: { label: 'Handmade kite', url: '/red-kite/models/kite.glb', size: .6 },
} as const;
export type MemoryAsset = keyof typeof MEMORY_ASSETS;
export const MEMORY_SLOTS = [[1.45, 0, -2.3], [-1.25, 0, -1.65], [.6, 0, -3.5]] as const;

/** Reject oversized or network-dependent models before they reach the headset. */
export function validateMemoryGlb(bytes: Uint8Array): { triangles: number } {
  if (bytes.byteLength < 28 || bytes.byteLength > 12_000_000) throw new Error('The model must be a GLB smaller than 12 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('The model is not a complete GLB 2 file.');
  const length = view.getUint32(12, true);
  if (length > 2_000_000 || length + 20 > bytes.byteLength) throw new Error('The model manifest is invalid.');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (json.asset?.version !== '2.0' || !Array.isArray(json.meshes) || json.meshes.length > 80 || (json.nodes?.length ?? 0) > 160) throw new Error('Choose a simpler static object.');
  if ((json.buffers ?? []).some((b: { uri?: string }) => b.uri) || (json.images ?? []).some((i: { uri?: string }) => i.uri) || (json.images?.length ?? 0) > 4) throw new Error('External model resources are not supported.');
  if ((json.extensionsRequired ?? []).length || (json.skins?.length ?? 0) || (json.animations?.length ?? 0)) throw new Error('Use a static GLB without required compression extensions.');
  const bin = 20 + length;
  if (length % 4 || bin + 8 > bytes.byteLength || view.getUint32(bin + 4, true) !== 0x004e4942 || bin + 8 + view.getUint32(bin, true) !== bytes.byteLength) throw new Error('The embedded model buffer is incomplete.');
  if (json.buffers?.length !== 1 || !Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength < 1 || json.buffers[0].byteLength > view.getUint32(bin, true)) throw new Error('Invalid embedded buffer.');
  for (const b of json.bufferViews ?? []) {
    if (b.buffer !== 0 || !Number.isInteger(b.byteLength) || b.byteLength < 1 || !Number.isInteger(b.byteOffset ?? 0) || (b.byteOffset ?? 0) < 0 || (b.byteOffset ?? 0) + b.byteLength > json.buffers[0].byteLength) throw new Error('Invalid geometry buffer range.');
  }
  const componentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  if (!Array.isArray(json.accessors) || json.accessors.length > 256) throw new Error('Invalid model accessors.');
  for (const a of json.accessors) {
    const b = json.bufferViews?.[a.bufferView], element = (componentBytes[a.componentType] ?? 0) * (components[a.type] ?? 0);
    const stride = b?.byteStride ?? element, offset = a.byteOffset ?? 0;
    if (!b || a.sparse || !element || !Number.isInteger(a.count) || a.count < 1 || a.count > 120_000 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(stride) || stride < element || stride > 252 || offset + (a.count - 1) * stride + element > b.byteLength) throw new Error('Invalid accessor buffer range.');
  }
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives ?? []) {
    if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Only triangle meshes are supported.');
    const vertices = json.accessors?.[primitive.attributes?.POSITION]?.count;
    const position = json.accessors?.[primitive.attributes?.POSITION];
    if (position?.type !== 'VEC3' || position.componentType !== 5126) throw new Error('Invalid vertex positions.');
    const count = primitive.indices === undefined ? vertices : json.accessors?.[primitive.indices]?.count;
    if (!Number.isInteger(vertices) || vertices < 3 || vertices > 120_000 || !Number.isInteger(count) || count % 3) throw new Error('Invalid model geometry.');
    triangles += count / 3;
  }
  if (triangles < 1 || triangles > 20_000) throw new Error('The headset model must have at most 20,000 triangles.');
  return { triangles };
}
