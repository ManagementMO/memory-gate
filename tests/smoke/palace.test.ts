import { expect, test } from 'vitest';
import { palaceWorldRequest, parsePalaceCapture, PALACE_PROMPT } from '../../packages/shared/src/palace';

const capture = () => ({ schema: 'memory-gate.palace-capture/1', title: 'Palace by the lagoon', capturePosition: 'Land-side path, facing the rotunda.',
  rights: 'Project team photographs, source review complete.', reviewedForUpload: true,
  images: [{ file: 'front.jpg', azimuthDegrees: 0 }, { file: 'left.jpg' }], measuredReference: { label: 'Measured path slab', meters: .6 } });

test('Palace intake leaves unknown directions unknown and builds a private, bounded multi-image request', () => {
  const c = parsePalaceCapture(capture());
  const r = palaceWorldRequest(c, ['media-front', 'media-left']);
  expect(r.permission).toEqual({ public: false, allow_id_access: false });
  expect(r.world_prompt).toMatchObject({ type: 'multi-image', reconstruct_images: false });
  expect(r.world_prompt.multi_image_prompt[0]).toMatchObject({ azimuth: 0, content: { source: 'media_asset', media_asset_id: 'media-front' } });
  expect(r.world_prompt.multi_image_prompt[1]).not.toHaveProperty('azimuth');
  expect(JSON.stringify(r)).not.toContain('http');
  expect(PALACE_PROMPT).toContain('Do not replace water with walkable land');
  expect(PALACE_PROMPT).toContain('not proof of a personal memory');
});

test('Palace intake rejects duplicated/traversing images, unsafe angles and an oversized input set', () => {
  for (const file of ['../front.jpg', '/tmp/front.jpg', 'a/../../front.jpg', 'C:\\front.jpg', 'front.heic']) {
    const c = capture(); c.images[0]!.file = file; expect(() => parsePalaceCapture(c)).toThrow();
  }
  const duplicate = capture(); duplicate.images[1]!.file = duplicate.images[0]!.file;
  expect(() => parsePalaceCapture(duplicate)).toThrow(/distinct/);
  const angle = capture(); angle.images[0]!.azimuthDegrees = NaN;
  expect(() => parsePalaceCapture(angle)).toThrow(/azimuth/);
  expect(() => parsePalaceCapture({ ...capture(), images: Array.from({ length: 5 }, (_, i) => ({ file: `${i}.jpg` })) })).toThrow(/2–4/);
});

test('review and measured scale stay explicit; incomplete captures cannot become provider requests', () => {
  const c = parsePalaceCapture({ ...capture(), reviewedForUpload: false, measuredReference: null });
  expect(c.measuredReference).toBe(null);
  expect(() => palaceWorldRequest(c, ['one', 'two'])).toThrow(/Review/);
  const reviewed = parsePalaceCapture(capture());
  expect(() => palaceWorldRequest(reviewed, ['same', 'same'])).toThrow(/distinct/);
  expect(() => palaceWorldRequest(reviewed, ['one'])).toThrow();
  expect(() => parsePalaceCapture({ ...capture(), measuredReference: { label: 'guess', meters: Infinity } })).toThrow();
});
