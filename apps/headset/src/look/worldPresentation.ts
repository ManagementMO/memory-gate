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

/** The meadow contains sky/landscape centers past 267m; the photo camera's 200m far plane clips them. */
export function environmentFarPlane(source: string): number {
  return source === 'worldlabs' ? 1000 : 200;
}
