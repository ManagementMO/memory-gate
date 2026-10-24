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
import type * as consents from "../consents.js";
import type * as corrections from "../corrections.js";
import type * as doctor from "../doctor.js";
import type * as exchange from "../exchange.js";
import type * as generate from "../generate.js";
import type * as jobsdb from "../jobsdb.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_storage from "../lib/storage.js";
import type * as library from "../library.js";
import type * as objects from "../objects.js";
import type * as rooms from "../rooms.js";
import type * as splats from "../splats.js";
import type * as utterances from "../utterances.js";
import type * as voice from "../voice.js";
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
  consents: typeof consents;
  corrections: typeof corrections;
  doctor: typeof doctor;
  exchange: typeof exchange;
  generate: typeof generate;
  jobsdb: typeof jobsdb;
  "lib/auth": typeof lib_auth;
  "lib/storage": typeof lib_storage;
  library: typeof library;
  objects: typeof objects;
  rooms: typeof rooms;
  splats: typeof splats;
  utterances: typeof utterances;
  voice: typeof voice;
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
