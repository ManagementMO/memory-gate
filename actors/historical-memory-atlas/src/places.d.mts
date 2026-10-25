export type PlaceReference = { title: string; sourceUrl: string; address: string; lat: number | null; lng: number | null };
export function placeQuery(value: unknown): string;
export function mapsUrl(value: unknown): string | null;
export function placeInput(query: string): Record<string, unknown>;
export function normalizePlaces(rows: unknown): PlaceReference[];
