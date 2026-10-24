import { asksToKeepUnchanged, norm } from './contract';

export type SpatialObject = { id: string; label: string; size: number; position: number[]; facingYaw?: number | null };
export type SpatialRequest = { objectId: string; referenceId: string; facingId?: string; relation: 'next_to' | 'left_of' | 'right_of' | 'stay' };
export type SpatialPlan = { position: [number, number, number]; yaw: number; description: string };

export function finitePosition(position: number[]): position is [number, number, number] {
  return position.length === 3 && position.every(Number.isFinite)
    && Math.abs(position[0]!) <= 12 && position[1]! >= 0 && position[1]! <= 3 && Math.abs(position[2]!) <= 12;
}

/** Fixed map frame: X right, Y up, -Z into the memory. No model supplies coordinates. */
export function planPlacement(objects: SpatialObject[], request: SpatialRequest): SpatialPlan {
  const target = objects.find(o => o.id === request.objectId);
  const reference = objects.find(o => o.id === request.referenceId);
  const facing = request.facingId ? objects.find(o => o.id === request.facingId) : null;
  if (!target || !reference || (request.facingId && !facing)) throw new Error('Choose existing objects in this room.');
  if (request.relation !== 'stay' && target.id === reference.id) throw new Error('Choose a different reference object.');
  if (facing?.id === target.id) throw new Error('An object cannot face itself.');
  if (objects.some(o => !finitePosition(o.position) || !Number.isFinite(o.size) || o.size <= 0)) throw new Error('The room has an invalid placement.');
  const gap = (target.size + reference.size) * 0.5 + 0.4;
  const directions = request.relation === 'left_of' ? [[-1, 0]]
    : request.relation === 'right_of' ? [[1, 0]]
      : request.relation === 'stay' ? [[0, 0]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const candidates = directions.map(([x, z]) => request.relation === 'stay'
    ? [...target.position] as [number, number, number]
    : [reference.position[0]! + x! * gap, reference.position[1]!, reference.position[2]! + z! * gap] as [number, number, number]);
  const position = candidates.find(p => finitePosition(p) && Math.abs(p[0]) <= 7 && p[2] >= -9 && p[2] <= 3
    && objects.every(o => o.id === target.id || Math.hypot(p[0] - o.position[0]!, p[2] - o.position[2]!) >= (target.size + o.size) * 0.35));
  if (!position) throw new Error('There is no clear supported placement there. Try another side.');
  const yaw = facing ? Math.atan2(facing.position[0]! - position[0], facing.position[2]! - position[2])
    : target.facingYaw ?? Math.atan2(-position[0], -position[2]);
  const relation = request.relation === 'left_of' ? 'to the left of' : request.relation === 'right_of' ? 'to the right of' : 'beside';
  return { position, yaw, description: request.relation === 'stay'
    ? `Turn the ${target.label} toward the ${facing?.label ?? reference.label}.`
    : `Move the ${target.label} ${relation} the ${reference.label}${facing ? `, facing the ${facing.label}` : ''}.` };
}

const ALIASES: Record<string, string[]> = {
  bench: ['bench', 'banco', 'banca'], tree: ['tree', 'árbol', 'arbol'], gate: ['gate', 'puerta', 'portón', 'porton'],
  chair: ['chair', 'silla'], armchair: ['armchair', 'sillón', 'sillon'], piano: ['piano'],
  radio: ['radio'], photograph: ['photograph', 'photo', 'foto', 'fotografía'], lamp: ['lamp', 'lámpara', 'lampara'],
};
function resolve(phrase: string, objects: SpatialObject[]): SpatialObject | null {
  const text = norm(phrase).replace(/^(?:the|a|el|la|un|una) /u, '');
  const hits = objects.filter(o => [o.label, ...(ALIASES[o.label] ?? [])].some(a => norm(a) === text));
  return hits.length === 1 ? hits[0]! : null;
}

/** A deliberately bounded bilingual command grammar. Ordinary narration still goes to Claude. */
export function spokenCorrection(transcript: string, objects: SpatialObject[]): { handled: boolean; request?: SpatialRequest; message?: string } {
  const t = norm(transcript);
  if (asksToKeepUnchanged(transcript)) return { handled: true, message: 'The current placement is unchanged.' };
  if (transcript.includes('?') || !/^(?:move|put|place|turn|rotate|mueve|mueva|pon|coloca|gira|gire)\b/u.test(t)) return { handled: false };
  const turn = /^(?:turn|rotate|gira|gire)\b/u.test(t);
  const facingMatch = t.match(/(?: facing | toward | towards | mirando hacia | orientad[oa] hacia )(.+)$/u);
  const main = facingMatch ? t.slice(0, facingMatch.index) : t;
  const match = turn
    ? main.match(/^(?:turn|rotate|gira|gire) (.+)$/u)
    : main.match(/^(?:move|put|place|mueve|mueva|pon|coloca) (.+?) (beside|next to|to the left of|to the right of|al lado del?|junto a|a la izquierda del?|a la derecha del?) (.+)$/u);
  const target = match ? resolve(match[1]!, objects) : null;
  const reference = turn ? target : match ? resolve(match[3]!, objects) : null;
  const facing = facingMatch ? resolve(facingMatch[1]!, objects) : null;
  if (!target || !reference || (facingMatch && !facing) || (turn && !facing)) return {
    handled: true, message: 'Choose one existing object and a clear reference. For example: “Move the bench beside the tree, facing the gate.”',
  };
  return { handled: true, request: {
    objectId: target.id, referenceId: reference.id, ...(facing ? { facingId: facing.id } : {}),
    relation: turn ? 'stay' : /left|izquierda/u.test(match![2]!) ? 'left_of' : /right|derecha/u.test(match![2]!) ? 'right_of' : 'next_to',
  } };
}
