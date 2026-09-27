// Mirrors citizensRunelite's src/main/java/com/magnaboy/serialization/*.java
// Field names/casing must match exactly - Gson matches by exact Java field name,
// no custom serialized-name adapters exist on the plugin side.

export type WorldPoint = {
  x: number;
  y: number;
  plane: number;
};

export type MergedObject = {
  objectID: number;
  count90CCWRotations: number;
};

export type EntityType = "StationaryCitizen" | "WanderingCitizen" | "ScriptedCitizen" | "Scenery";

export interface EntityInfo {
  uuid: string;
  regionId: number;
  entityType: EntityType;
  worldLocation: WorldPoint;
  modelIds: number[];
  baseOrientation?: number | null;
  // NOTE: passed through as-is. The Java plugin negates each axis internally at
  // render time (Entity.initModel) - this tool does not need to re-negate.
  scale?: [number, number, number] | null;
  translate?: [number, number, number] | null;
  modelRecolorFind: number[];
  modelRecolorReplace: number[];
  idleAnimation?: string | null;
  removedObject?: number | null;
  mergedObjects?: MergedObject[] | null;
}

export interface CitizenInfo extends EntityInfo {
  name: string;
  examineText: string;
  // ALWAYS an array, never null - Citizen.validate() in the Java plugin iterates
  // `remarks` with no null-check and will NPE (instead of raising a clean error)
  // if this is ever null.
  remarks: string[];
  moveAnimation?: string | null;
  // Required (non-null) iff entityType === "WanderingCitizen".
  wanderBoxBL?: WorldPoint | null;
  wanderBoxTR?: WorldPoint | null;
  // Only meaningful for ScriptedCitizen; references a file under Scripts/<name>.json.
  // Not editable in this tool's v1.
  startScript?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SceneryInfo extends EntityInfo {}

export interface CitizenRegionFile {
  // MUST serialize as exactly the number 0.8 (not a string, not a drifted float) -
  // CitizenRegion.loadRegion in the Java plugin does `region.version != VALID_REGION_VERSION`
  // (VALID_REGION_VERSION = 0.8f) and silently discards the whole file (no error logged) on mismatch.
  version: 0.8;
  regionId: number;
  citizenRoster: CitizenInfo[];
  sceneryRoster: SceneryInfo[];
}

export type RegionSummary = {
  regionId: number;
  citizenCount: number;
  sceneryCount: number;
};

// Entities from a block of neighbouring regions, for drawing surroundings on a region map.
// Entities already carry `regionId`, but it's the region whose file they live in, which is
// what the client needs to address them for edit/delete - so nothing extra is attached.
// A real game NPC that appears somewhere near a region, deduplicated to one entry per NPC
// id. Exists so you can find the NPCs around a place and clone one into a citizen - the
// individual spawn positions aren't kept, because nothing here does anything with them.
export type NearbyNpc = {
  npcId: number;
  name: string;
  // How many times this NPC spawns within the searched radius. Ordering hint more than
  // anything: the common residents of an area rank above one-off spawns.
  spawnCount: number;
  // Resolved from the game cache by npcId, so thumbnails match the entity browser.
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
};

export type NearbyEntities = {
  centerRegionId: number;
  // Chebyshev radius in regions: `radius` regions in each direction, so (2r+1)^2 total.
  radius: number;
  // Only regions that actually have a file on disk are included.
  regionIds: number[];
  citizens: CitizenInfo[];
  scenery: SceneryInfo[];
};

export type RenderRequest = {
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
  // Cache sequence id (not the plugin's enum name - use animationSequenceId() to convert).
  // When set, the exported GLTF carries the whole frame cycle as morph-target animation.
  // Omitted/null exports a static pose.
  animationId?: number | null;
};

export type StatusResponse = {
  cacheReady: boolean;
  repoPath: string;
  cachePath: string;
  regionDataPath: string;
};

// One identikit (character-creation body part) entry, e.g. a specific torso/legs/hair
// appearance option. `models` is what actually goes into a citizen's modelIds array.
export type KitSummary = {
  id: number;
  models: number[];
  recolorFind: number[];
  recolorReplace: number[];
  nonSelectable: boolean;
};

// ---------------------------------------------------------------------------
// Scripts (Scripts/<name>.json) - ScriptedCitizen movement routines.
//
// Mirrors com.magnaboy.scripting.ScriptFile / ScriptAction field-for-field, same Gson
// exact-field-name rule as the region types above.
// ---------------------------------------------------------------------------

export type ActionType = "Idle" | "WalkTo" | "Animation" | "Say" | "FaceDirection";

// Mirrors CardinalDirection.java. NorthEast was missing from the Java enum until the 2026
// plugin revamp added it - scripts using it need a plugin build from that revamp or later.
export type CardinalDirection =
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "West"
  | "SouthWest"
  | "South"
  | "SouthEast"
  | "East";

export type ScriptAction = {
  action: ActionType;
  // Delay before the next action runs. Absent is treated as 0 by Gson's default float.
  secondsTilNextAction?: number | null;
  timesToLoop?: number | null;
  // Required when action === "WalkTo".
  targetPosition?: WorldPoint | null;
  // Required when action === "Say".
  message?: string | null;
  // Required when action === "Animation". An AnimationID enum *name*, not a raw id.
  animationId?: string | null;
  scriptName?: string | null;
  // Required when action === "FaceDirection".
  targetRotation?: CardinalDirection | null;
};

export type ScriptFile = {
  // ScriptFile.java types this as a Queue that the plugin polls and re-appends, so every
  // script loops forever - there is no "end of script".
  actions: ScriptAction[];
};

export type ScriptSummary = {
  name: string;
  actionCount: number;
  // Scripts are global and referenced by bare name, so one routine can back several
  // citizens across different regions. Surfaced so editing can warn about shared use.
  usedBy: { regionId: number; uuid: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Entity browser (cache-derived catalogs)
//
// These are NOT part of the Java plugin contract - they describe cache content this
// tool browses purely as a source of model ids to copy into a citizen's modelIds.
// ---------------------------------------------------------------------------

export type EntityKind = "npc" | "object" | "item";

// A labelled set of model ids belonging to one entity. Entities carry several distinct
// sets that aren't interchangeable (an item's inventory icon model is a different mesh
// from the model it uses when wielded), so they're kept separate and labelled rather
// than flattened into one list.
export type ModelVariant = {
  label: string;
  modelIds: number[];
};

export type EntitySummary = {
  kind: EntityKind;
  id: number;
  // Cache entries frequently have no name (unused/placeholder slots), and some carry
  // the literal string "null" - both are normalized to null here.
  name: string | null;
  // The variant chosen to represent this entity in list/thumbnail views.
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
};

export type EntityDetail = EntitySummary & {
  variants: ModelVariant[];
  // Set when the cache record used an opcode this build's loader doesn't understand, so
  // parsing stopped early and later fields may be missing. Surfaced rather than hidden -
  // an unexplained gap in the UI is worse than a labelled one.
  truncatedAtOpcode: number | null;
  // NPC-only.
  standingAnimation?: number | null;
  walkingAnimation?: number | null;
  size?: number | null;
  combatLevel?: number | null;
  actions?: string[];
  // Object-only. Parallel to the primary variant's modelIds: one orientation/shape type
  // per model. Null when the cache record used a models-only opcode.
  objectTypes?: number[] | null;
  sizeX?: number | null;
  sizeY?: number | null;
};

export type EntityPage = {
  kind: EntityKind;
  // Total matching the current query, not the catalog size - drives pagination.
  total: number;
  offset: number;
  limit: number;
  items: EntitySummary[];
};

// ---------------------------------------------------------------------------
// Favorites (tool-only - NOT part of the Java plugin contract, unlike every
// other type in this file. Freely add/change fields here without touching
// CitizenRegion.java or any Gson round-trip behavior.)
// ---------------------------------------------------------------------------

export type FavoriteKind = "npc" | "object" | "item" | "citizen" | "scenery";

// A frozen snapshot, not a live pointer: editing or deleting the source
// (an NPC def changing, a citizen being deleted) does not change or invalidate
// an existing favorite. Re-favorite the same key to refresh it.
export type FavoriteEntry = {
  // Identity + dedup key. "npc:1234" / "object:5" / "item:9" for cache
  // entities; "citizen:<regionId>:<uuid>" / "scenery:<regionId>:<uuid>" for
  // RegionData entities.
  key: string;
  kind: FavoriteKind;
  // Display-only breadcrumb back to where this was favorited from, e.g.
  // "npc #1234" or "region 12086". Never used for lookups.
  sourceLabel: string;
  name: string | null;
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
  // Loose label->value bag rather than a discriminated union per kind: npc
  // snapshots carry numeric cache sequence ids (standing/walking), citizen/
  // scenery snapshots carry AnimationID name strings (idle/move). Empty `{}`
  // for object/item, which have no animation fields in the cache at all.
  animations: Record<string, string | number>;
  savedAt: string; // ISO timestamp, set server-side on create
};
