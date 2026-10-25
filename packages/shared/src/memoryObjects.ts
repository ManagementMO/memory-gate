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
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives ?? []) {
    if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Only triangle meshes are supported.');
    const vertices = json.accessors?.[primitive.attributes?.POSITION]?.count;
    const count = primitive.indices === undefined ? vertices : json.accessors?.[primitive.indices]?.count;
    if (!Number.isInteger(vertices) || vertices < 3 || vertices > 120_000 || !Number.isInteger(count) || count % 3) throw new Error('Invalid model geometry.');
    triangles += count / 3;
  }
  if (triangles < 1 || triangles > 20_000) throw new Error('The headset model must have at most 20,000 triangles.');
  return { triangles };
}
