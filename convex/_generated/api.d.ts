/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as ai from "../ai.js";
import type * as avatars from "../avatars.js";
import type * as budget from "../budget.js";
import type * as consents from "../consents.js";
import type * as corrections from "../corrections.js";
import type * as doctor from "../doctor.js";
import type * as exchange from "../exchange.js";
import type * as generate from "../generate.js";
import type * as guide from "../guide.js";
import type * as jobsdb from "../jobsdb.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_claude from "../lib/claude.js";
import type * as lib_guideRender from "../lib/guideRender.js";
import type * as lib_memoryObjectFiles from "../lib/memoryObjectFiles.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_worldAssetDownload from "../lib/worldAssetDownload.js";
import type * as library from "../library.js";
import type * as memories from "../memories.js";
import type * as memoryImport from "../memoryImport.js";
import type * as memoryModels from "../memoryModels.js";
import type * as memoryObjects from "../memoryObjects.js";
import type * as memorySources from "../memorySources.js";
import type * as memoryUpload from "../memoryUpload.js";
import type * as moments from "../moments.js";
import type * as objectKnowledge from "../objectKnowledge.js";
import type * as objectKnowledgeActions from "../objectKnowledgeActions.js";
import type * as objects from "../objects.js";
import type * as presence from "../presence.js";
import type * as redKite from "../redKite.js";
import type * as rooms from "../rooms.js";
import type * as sketch from "../sketch.js";
import type * as splats from "../splats.js";
import type * as utterances from "../utterances.js";
import type * as voice from "../voice.js";
import type * as voiceGuard from "../voiceGuard.js";
import type * as worlddb from "../worlddb.js";
import type * as worldlabs from "../worldlabs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  ai: typeof ai;
  avatars: typeof avatars;
  budget: typeof budget;
  consents: typeof consents;
  corrections: typeof corrections;
  doctor: typeof doctor;
  exchange: typeof exchange;
  generate: typeof generate;
  guide: typeof guide;
  jobsdb: typeof jobsdb;
  "lib/auth": typeof lib_auth;
  "lib/claude": typeof lib_claude;
  "lib/guideRender": typeof lib_guideRender;
  "lib/memoryObjectFiles": typeof lib_memoryObjectFiles;
  "lib/storage": typeof lib_storage;
  "lib/worldAssetDownload": typeof lib_worldAssetDownload;
  library: typeof library;
  memories: typeof memories;
  memoryImport: typeof memoryImport;
  memoryModels: typeof memoryModels;
  memoryObjects: typeof memoryObjects;
  memorySources: typeof memorySources;
  memoryUpload: typeof memoryUpload;
  moments: typeof moments;
  objectKnowledge: typeof objectKnowledge;
  objectKnowledgeActions: typeof objectKnowledgeActions;
  objects: typeof objects;
  presence: typeof presence;
  redKite: typeof redKite;
  rooms: typeof rooms;
  sketch: typeof sketch;
  splats: typeof splats;
  utterances: typeof utterances;
  voice: typeof voice;
  voiceGuard: typeof voiceGuard;
  worlddb: typeof worlddb;
  worldlabs: typeof worldlabs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
