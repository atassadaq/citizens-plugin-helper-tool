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

export type RenderRequest = {
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
};

export type StatusResponse = {
  cacheReady: boolean;
  repoPath: string;
  cachePath: string;
  regionDataPath: string;
};
