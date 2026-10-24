/** Keep the capability check aligned with the project's VR session; render opaque in both eyes. */
export const XR_SESSION_MODE = 'immersive-vr' as const;
export const XR_BACKGROUND = 0x0d0a07;
export const DEFAULT_FRAMEBUFFER_SCALE = 0.75;

/** Splat count and eye-buffer resolution are independent budgets. A lite world never overrides this. */
export function xrFramebufferScale(value: string | null): number {
  if (value === null || !value.trim()) return DEFAULT_FRAMEBUFFER_SCALE;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.5 && number <= 1.25 ? number : DEFAULT_FRAMEBUFFER_SCALE;
}
