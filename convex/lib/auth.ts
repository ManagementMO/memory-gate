// Room membership checks: every public function takes the room code AND the member token returned by
// createRoom/joinRoom. The actor for events is derived from the member row, never from client input.
import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Scope } from '../../packages/shared/src/contract';
import { DEFAULT_FLAGS, type FlagName, type Flags } from '../../packages/shared/src/flags';

export async function requireMember(ctx: QueryCtx | MutationCtx, code: string, token: string, roles?: string[]) {
  const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code.toUpperCase())).unique();
  if (!room) throw new ConvexError({ code: 'ROOM_NOT_FOUND', message: 'No room with that code.' });
  const member = await ctx.db.query('members').withIndex('by_token', (q) => q.eq('token', token)).unique();
  if (!member || member.roomId !== room._id || member.revokedAt !== null) throw new ConvexError({ code: 'NOT_A_MEMBER', message: 'Join this room first.' });
  if (roles && !roles.includes(member.role)) throw new ConvexError({ code: 'FORBIDDEN', message: `Only ${roles.join(' or ')} can do that.` });
  if (!roles && member.role === 'viewer' && !(await activeScopes(ctx, room._id)).has('share_with_family')) {
    throw new ConvexError({ code: 'NOT_SHARED', message: 'Family sharing is off. Ask the room owner to enable it before watching.' });
  }
  return { room, member };
}

export async function requireOwner(ctx: QueryCtx | MutationCtx, code: string, token: string) {
  const r = await requireMember(ctx, code, token);
  if (!r.member.isOwner) throw new ConvexError({ code: 'FORBIDDEN', message: 'Only the room owner can do that.' });
  return r;
}

export async function activeScopes(ctx: QueryCtx | MutationCtx, roomId: Id<'rooms'>): Promise<Set<string>> {
  const rows = await ctx.db.query('consents').withIndex('by_room', (q) => q.eq('roomId', roomId)).collect();
  return new Set(rows.filter((c) => c.revokedAt === null).flatMap((c) => c.scopes));
}

export async function requireScope(ctx: QueryCtx | MutationCtx, roomId: Id<'rooms'>, scope: Scope) {
  if (!(await activeScopes(ctx, roomId)).has(scope)) throw new ConvexError({ code: 'NO_CONSENT', message: `Needs consent: ${scope}.` });
}

export async function readFlags(ctx: QueryCtx | MutationCtx, room?: Pick<Doc<'rooms'>, 'offline'>): Promise<Flags> {
  const rows = await ctx.db.query('flags').collect();
  const flags = { ...DEFAULT_FLAGS };
  for (const r of rows) if (r.name in flags) flags[r.name as FlagName] = r.value;
  if (room?.offline) for (const name of ['ai.live', 'stt.live', 'tts.live', 'splat.live', 'objects.live', 'worldlabs.generate'] as const) flags[name] = false;
  return flags;
}

// Unguessable tokens; join codes avoid look-alike characters.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomString(n: number, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
export const newRoomCode = () => randomString(6, CODE_ALPHABET);
export const newToken = () => randomString(32);

/** Append an authored event and bump the room revision (one transaction with the change it records). */
export async function appendEvent(ctx: MutationCtx, room: Doc<'rooms'>, e: {
  kind: string; objectId: Id<'objects'> | null; actor: string; memberId: Id<'members'> | null; commandId: string | null; prevStatus?: string | null; undoes?: Id<'events'> | null;
}) {
  const revision = room.revision + 1;
  await ctx.db.patch(room._id, { revision });
  return ctx.db.insert('events', {
    roomId: room._id, kind: e.kind, objectId: e.objectId, actor: e.actor, memberId: e.memberId, at: Date.now(), revision,
    commandId: e.commandId, prevStatus: e.prevStatus ?? null, undoneBy: null, undoes: e.undoes ?? null,
  });
}

/** Idempotency (Heirloom gap 2): a command id that already produced an event is a no-op returning that event. */
export async function priorCommand(ctx: MutationCtx, roomId: Id<'rooms'>, commandId: string | null | undefined) {
  if (!commandId) return null;
  return ctx.db.query('events').withIndex('by_room_command', (q) => q.eq('roomId', roomId).eq('commandId', commandId)).first();
}
