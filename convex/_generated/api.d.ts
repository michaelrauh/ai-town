/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as narrative_actions from "../narrative/actions.js";
import type * as narrative_api from "../narrative/api.js";
import type * as narrative_beats_index from "../narrative/beats/index.js";
import type * as narrative_beats from "../narrative/beats.js";
import type * as narrative_rooms from "../narrative/rooms.js";
import type * as narrative_state from "../narrative/state.js";
import type * as narrative_triggers from "../narrative/triggers.js";
import type * as narrative_voiceCards from "../narrative/voiceCards.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "narrative/actions": typeof narrative_actions;
  "narrative/api": typeof narrative_api;
  "narrative/beats/index": typeof narrative_beats_index;
  "narrative/beats": typeof narrative_beats;
  "narrative/rooms": typeof narrative_rooms;
  "narrative/state": typeof narrative_state;
  "narrative/triggers": typeof narrative_triggers;
  "narrative/voiceCards": typeof narrative_voiceCards;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
