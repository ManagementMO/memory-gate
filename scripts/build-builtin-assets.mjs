// Reproducible, original geometry. No paid providers, downloads, private paths or textures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { makeProp, PROP_SIZES } from '../apps/headset/src/scene-assets/props.scene-asset.ts';
const requireHeadset = createRequire(new URL('../apps/headset/package.json', import.meta.url));
const { GLTFExporter } = await import(pathToFileURL(requireHeadset.resolve('three/addons/exporters/GLTFExporter.js')).href);
globalThis.FileReader ??= class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const output = new URL('../fixtures/builtin/', import.meta.url);
mkdirSync(output, { recursive: true });
for (const key of Object.keys(PROP_SIZES)) {
  const model = makeProp(key);
  const result = await new GLTFExporter().parseAsync(model, { binary: true });
  if (!(result instanceof ArrayBuffer)) throw new Error('Expected a binary GLB');
  writeFileSync(new URL(`${key}.glb`, output), Buffer.from(result));
}
writeFileSync(new URL('manifest.json', output), JSON.stringify({
  source: 'Original procedural illustration', generatedFromFamilyPhoto: false,
  axes: 'Y up, +Z front, floor contact Y=0',
  license: 'Project-owned original illustrative assets; see source for reproducible geometry.',
  assets: Object.entries(PROP_SIZES).map(([key, size]) => ({ key, size, file: `${key}.glb` })),
}, null, 2) + '\n');
console.log(`Built ${Object.keys(PROP_SIZES).length} original GLBs in fixtures/builtin.`);
