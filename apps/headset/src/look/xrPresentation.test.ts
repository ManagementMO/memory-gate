import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { XR_SESSION_MODE, DEFAULT_FRAMEBUFFER_SCALE, xrFramebufferScale } from './xrPresentation';

test('the project and capability check request the same immersive VR mode', () => {
  const config = JSON.parse(readFileSync(new URL('../../iwsdk.config.json', import.meta.url), 'utf8'));
  expect(`immersive-${config.world.xr.mode}`).toBe(XR_SESSION_MODE);
  expect(config.world.xr.features.handTracking).toBe(true);
  expect(config.world.features.sceneUnderstanding).toBe(false);
});

test('eye resolution respects an explicit setting and rejects unusable values', () => {
  expect(xrFramebufferScale(null)).toBe(DEFAULT_FRAMEBUFFER_SCALE);
  expect(xrFramebufferScale('1')).toBe(1);
  expect(xrFramebufferScale('0.5')).toBe(.5);
  for (const bad of ['NaN', 'Infinity', '-1', '0', '2', '']) expect(xrFramebufferScale(bad)).toBe(DEFAULT_FRAMEBUFFER_SCALE);
});
