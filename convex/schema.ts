import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const vec3 = v.array(v.number());
export const anchorV = v.object({ position: vec3, normal: v.optional(vec3), source: v.string() });
export const pointerV = v.object({ origin: vec3, direction: vec3, hit: v.union(vec3, v.null()), surfaceHit: v.optional(v.union(vec3, v.null())), source: v.string() });

export default defineSchema({
  memoryImports: defineTable({
    roomId: v.id('rooms'), memberId: v.id('members'), mode: v.string(), status: v.string(),
    urls: v.array(v.string()), runId: v.union(v.string(), v.null()), actorId: v.string(),
    error: v.union(v.string(), v.null()), createdAt: v.number(),
    kind: v.optional(v.literal('place')), queryText: v.optional(v.string()),
  }).index('by_room', ['roomId']),
  memoryPlaces: defineTable({
    roomId: v.id('rooms'), importId: v.id('memoryImports'), title: v.string(), address: v.string(),
    sourceUrl: v.union(v.string(), v.null()), lat: v.union(v.number(), v.null()), lng: v.union(v.number(), v.null()),
    approved: v.boolean(), execution: v.string(), runId: v.union(v.string(), v.null()), createdAt: v.number(),
  }).index('by_room', ['roomId']),
  memoryObjects: defineTable({
    roomId: v.id('rooms'), memberId: v.id('members'), sourceId: v.union(v.id('memorySources'), v.null()), placeId: v.union(v.id('memoryPlaces'), v.null()),
    perspective: v.string(), label: v.string(), note: v.string(), choice: v.string(), status: v.string(),
    assetKey: v.union(v.string(), v.null()), fileId: v.union(v.id('_storage'), v.null()), modelSource: v.string(),
    taskId: v.union(v.string(), v.null()), vendorConsent: v.boolean(), error: v.union(v.string(), v.null()),
    slot: v.union(v.number(), v.null()), size: v.number(), yaw: v.number(), commandId: v.string(),
    downloadLease: v.union(v.number(), v.null()), createdAt: v.number(),
  }).index('by_room', ['roomId']).index('by_room_command', ['roomId', 'commandId']),
  memorySources: defineTable({
    roomId: v.id('rooms'), importId: v.id('memoryImports'), approved: v.boolean(),
    sourceUrl: v.union(v.string(), v.null()), imageUrl: v.union(v.string(), v.null()), fileId: v.union(v.id('_storage'), v.null()),
    caption: v.string(), owner: v.string(), timestamp: v.union(v.string(), v.null()),
    suggestedObjects: v.array(v.string()), objectKey: v.string(), perspective: v.string(), note: v.string(),
    execution: v.string(), runId: v.union(v.string(), v.null()), createdAt: v.number(),
  }).index('by_room', ['roomId']).index('by_import', ['importId']),
  rooms: defineTable({
    code: v.string(), // 6-char join code (not a secret by itself: every call also needs a member token)
    title: v.string(),
    paused: v.boolean(),
    activeSplatId: v.union(v.id('splats'), v.null()),
    openedAt: v.union(v.number(), v.null()),
    headsetLastSeenAt: v.union(v.number(), v.null()),
    soundLevel: v.number(),
    echoEnabled: v.boolean(),
    familyNames: v.array(v.string()),
    revision: v.number(), // +1 per authored change (propose/confirm/reject/undo/pause/resume/reset)
    tripoCount: v.number(),
    joinKey: v.optional(v.string()), // in the family/headset links; the 6-char code alone joins as a viewer
    demo: v.boolean(),
    offline: v.optional(v.boolean()), // immutable fixture-only room; global live switches cannot enable paid services
    layout: v.optional(v.literal('courtyard')), // prepared courtyard uses a stable overview on desktop; XR stays at the real head pose
    createdAt: v.number(),
  }).index('by_code', ['code']),

  // Session identity (Heirloom gap 1): the actor always comes from this row, never from client-supplied names.
  members: defineTable({
    roomId: v.id('rooms'),
    token: v.string(),
    displayName: v.string(),
    role: v.string(), // family | storyteller | viewer
    isOwner: v.boolean(),
    createdAt: v.number(),
    revokedAt: v.union(v.number(), v.null()),
  }).index('by_token', ['token']).index('by_room', ['roomId']),

  // Who is here right now (one row per member, refreshed every couple of seconds while their page is open). Each
  // person is shown to the others as a light of their own colour; a "look here" mark travels with the same row.
  presence: defineTable({
    roomId: v.id('rooms'),
    memberId: v.id('members'),
    seat: v.number(), // order of arrival; sets the colour and where the light waits beside you
    color: v.string(),
    device: v.string(), // headset | phone | desktop
    point: v.union(v.object({ at: v.array(v.number()), t: v.number() }), v.null()),
    updatedAt: v.number(),
    leftAt: v.union(v.number(), v.null()),
  }).index('by_room', ['roomId']).index('by_member', ['memberId']).index('by_updated', ['updatedAt']),

  consents: defineTable({
    roomId: v.id('rooms'),
    memberId: v.id('members'),
    givenBy: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    revokedAt: v.union(v.number(), v.null()),
  }).index('by_room', ['roomId']),

  photos: defineTable({
    roomId: v.id('rooms'),
    fileId: v.id('_storage'),
    width: v.number(),
    height: v.number(),
    caption: v.union(v.string(), v.null()),
    tone: v.string(), // mono | sepia | muted
    credit: v.string(),
    createdAt: v.number(),
  }).index('by_room', ['roomId']),

  splats: defineTable({
    roomId: v.id('rooms'),
    photoId: v.union(v.id('photos'), v.null()),
    sourceUtteranceId: v.optional(v.id('utterances')), // exact words that requested this imagined place
    previewFileId: v.optional(v.id('_storage')), // cached provider thumbnail, reviewed before Show
    status: v.string(), // queued | running | ready | failed
    fileId: v.union(v.id('_storage'), v.null()),
    liteFileId: v.union(v.id('_storage'), v.null()),
    liteNumSplats: v.optional(v.union(v.number(), v.null())),
    worldId: v.optional(v.union(v.string(), v.null())),
    source: v.string(), // sharp | worldlabs | prebaked
    numSplats: v.number(),
    bytes: v.number(),
    gpuSeconds: v.number(),
    fPx: v.union(v.number(), v.null()),
    floorY: v.union(v.number(), v.null()), // floor height in splat units below the camera (placement plane)
    scale: v.number(), // splat units -> meters
    error: v.union(v.string(), v.null()),
    createdAt: v.number(),
    readyAt: v.union(v.number(), v.null()),
  }).index('by_room', ['roomId']),

  utterances: defineTable({
    roomId: v.id('rooms'),
    memberId: v.id('members'),
    speaker: v.string(), // the member's self-identified display name
    audioFileId: v.union(v.id('_storage'), v.null()), // null without voice_recording consent
    transcript: v.string(), // exactly as STT returned it (or typed, see source)
    source: v.string(), // stt | typed | fixture
    language: v.union(v.string(), v.null()),
    translation: v.union(v.string(), v.null()),
    pointer: v.union(pointerV, v.null()),
    durationMs: v.number(),
    baseRevision: v.optional(v.number()),
    status: v.string(), // pending | done | failed
    intent: v.union(v.string(), v.null()),
    reply: v.union(v.string(), v.null()), // the companion's (validated) reply
    replyTranslation: v.optional(v.union(v.string(), v.null())), // its English reading, for the family
    sayBack: v.union(v.string(), v.null()),
    aiMode: v.union(v.string(), v.null()), // live | mock
    aiMs: v.union(v.number(), v.null()),
    dropped: v.array(v.string()),
    commandId: v.string(),
    createdAt: v.number(),
  }).index('by_room', ['roomId']).index('by_command', ['commandId']).index('by_room_command', ['roomId', 'commandId']),

  objects: defineTable({
    roomId: v.id('rooms'),
    label: v.string(),
    details: v.array(v.string()),
    status: v.string(), // ghost | confirmed | rejected | undone
    model: v.string(), // placeholder | generating | ready | failed
    glbFileId: v.union(v.id('_storage'), v.null()),
    storedGlbFileId: v.union(v.id('_storage'), v.null()), // a GLB that arrived after confirm: stored, never swapped in
    prebakedKey: v.union(v.string(), v.null()),
    modelSource: v.string(), // library | tripo | retexture | placeholder
    size: v.number(), // largest dimension in meters (category size)
    yaw: v.number(),
    facingYaw: v.optional(v.number()),
    lastCorrectionId: v.optional(v.id('corrections')),
    anchor: anchorV,
    where: v.string(),
    quote: v.string(),
    utteranceId: v.union(v.id('utterances'), v.null()),
    proposedBy: v.string(),
    proposedByMemberId: v.id('members'),
    confirmedBy: v.union(v.string(), v.null()),
    tripoTaskId: v.union(v.string(), v.null()),
    createdAt: v.number(),
    confirmedAt: v.union(v.number(), v.null()),
  }).index('by_room', ['roomId']),

  events: defineTable({
    roomId: v.id('rooms'),
    kind: v.string(),
    objectId: v.union(v.id('objects'), v.null()),
    actor: v.string(),
    memberId: v.union(v.id('members'), v.null()),
    at: v.number(),
    revision: v.number(),
    commandId: v.union(v.string(), v.null()),
    prevStatus: v.union(v.string(), v.null()),
    undoneBy: v.union(v.id('events'), v.null()),
    undoes: v.union(v.id('events'), v.null()),
    correctionId: v.optional(v.id('corrections')),
  }).index('by_room', ['roomId']).index('by_command', ['commandId']).index('by_room_command', ['roomId', 'commandId']),

  corrections: defineTable({
    roomId: v.id('rooms'), objectId: v.id('objects'),
    referenceId: v.id('objects'), facingId: v.union(v.id('objects'), v.null()),
    relation: v.string(), baseRevision: v.number(),
    beforeAnchor: anchorV, beforeYaw: v.union(v.number(), v.null()),
    beforeCorrectionId: v.union(v.id('corrections'), v.null()),
    proposedAnchor: anchorV, proposedYaw: v.number(),
    utteranceId: v.union(v.id('utterances'), v.null()), quote: v.string(),
    description: v.string(), actor: v.string(), memberId: v.id('members'),
    commandId: v.string(), status: v.string(), createdAt: v.number(),
  }).index('by_room', ['roomId']).index('by_room_command', ['roomId', 'commandId']),

  jobs: defineTable({
    roomId: v.id('rooms'),
    kind: v.string(), // splat | object | retexture | worldlabs
    refId: v.string(),
    provider: v.string(), // modal | tripo | worldlabs | fixture
    status: v.string(), // queued | running | done | failed | cancelled
    attempts: v.number(),
    lastError: v.union(v.string(), v.null()),
    startedAt: v.union(v.number(), v.null()),
    finishedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    meta: v.optional(v.any()),
  }).index('by_room', ['roomId']).index('by_status', ['status']),

  // Deployment-wide reservations survive deleting/resetting a room. These are request caps, not a dollar balance.
  providerUsage: defineTable({ key: v.string(), count: v.number(), updatedAt: v.number() }).index('by_key', ['key']),

  library: defineTable({
    key: v.string(), // canonical label, e.g. "piano"
    synonyms: v.array(v.string()),
    fileId: v.id('_storage'),
    size: v.number(), // largest dimension in meters
    yawOffset: v.number(), // rotate the model so its front faces +Z
    source: v.string(), // tripo | cc0 | cc-by
    credit: v.string(),
  }).index('by_key', ['key']),

  // Room-independent assets the seed script uploads (fixture photo, prebaked splat, placeholder model).
  assets: defineTable({ key: v.string(), fileId: v.id('_storage'), meta: v.optional(v.any()) }).index('by_key', ['key']),

  flags: defineTable({ name: v.string(), value: v.boolean() }).index('by_name', ['name']),

  // ---- Memory Gate experience (apps/gate) ----
  // One visit through the gate: the words and media gathered, and the plan the sketch is drawn from.
  memories: defineTable({
    roomId: v.id('rooms'),
    title: v.string(),
    words: v.array(v.string()),
    plan: v.any(), // ScenePlan (packages/shared/src/scene.ts), validated before storing
    source: v.string(), // claude | offline
    mediaFileId: v.union(v.id('_storage'), v.null()),
    mediaKind: v.union(v.string(), v.null()), // photo | video
    caption: v.union(v.string(), v.null()), // what the companion saw in the photo
    memberId: v.optional(v.id('members')), // who began it (guests follow the host; the host welcomes a guest's photo)
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_room', ['roomId']),
  // Album moments: a picture of the place with the words that shaped it (and the original voice, if kept).
  redKiteTellings: defineTable({
    roomId: v.id('rooms'),
    key: v.union(v.literal('elena'), v.literal('rosa')),
    beat: v.number(), revision: v.number(),
    sourceIds: v.array(v.id('utterances')),
    decisions: v.array(v.object({ beat: v.number(), decision: v.union(v.literal('use'), v.literal('leave')) })),
  }).index('by_room', ['roomId']),

  moments: defineTable({
    roomId: v.id('rooms'),
    memberId: v.id('members'),
    memoryTitle: v.string(),
    caption: v.string(),
    speaker: v.string(), // you | companion
    kind: v.string(), // arrival | detail | final
    imageFileId: v.union(v.id('_storage'), v.null()),
    audioFileId: v.union(v.id('_storage'), v.null()),
    createdAt: v.number(),
  }).index('by_room', ['roomId']),
  // Estimated model spend (deployment-wide). Every Claude call records its usage; calls stop at the budget.
  spend: defineTable({ key: v.string(), usd: v.number(), calls: v.number(), inputTokens: v.number(), outputTokens: v.number(), updatedAt: v.number() }).index('by_key', ['key']),
  // Composed objects (primitives from Claude for things the library can't draw), cached by label + colour.
  sketchCache: defineTable({ key: v.string(), parts: v.any(), createdAt: v.number() }).index('by_key', ['key']),
});
