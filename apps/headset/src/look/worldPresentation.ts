export { environmentFarPlane } from '../../../../packages/shared/src/worldlabs.js';

export type RoomPresentation = {
  warmth: number;
  exposure: number;
  farStart: number;
  farEnd: number;
  revealRadius: number;
  /** Photo edges dissolve radially. Complete worlds must retain distant hills and sky. */
  distanceFade: boolean;
};

/** Generated worlds are complete environments; photo reconstructions keep their uncertain edges soft. */
export function roomPresentation(source: string, scale = 1): RoomPresentation {
  if (source === 'worldlabs') return { warmth: 0.04, exposure: 1, farStart: 28 / scale, farEnd: 36 / scale, revealRadius: 38 / scale, distanceFade: false };
  return { warmth: 0.12, exposure: 0.96, farStart: 6, farEnd: 8.5, revealRadius: 11.2, distanceFade: true };
}
