import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  CitizenInfo,
  CitizenRegionFile,
  NearbyEntities,
  RegionSummary,
  SceneryInfo,
} from "@citizens-helper/shared/src/types.js";
import { config } from "./config.js";

function regionFilePath(regionId: number): string {
  return path.join(config.regionDataPath, `${regionId}.json`);
}

// regionId = (regionX << 8) | regionY, each region a 64x64-tile chunk. Both axes are a
// single unsigned byte, so neighbours off the edge of the world simply don't exist.
const MAX_REGION_AXIS = 0xff;

export function regionsInRadius(centerRegionId: number, radius: number): number[] {
  const centerX = centerRegionId >> 8;
  const centerY = centerRegionId & 0xff;
  const ids: number[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x > MAX_REGION_AXIS || y > MAX_REGION_AXIS) continue;
      ids.push((x << 8) | y);
    }
  }
  return ids;
}

export async function readNearbyEntities(centerRegionId: number, radius: number): Promise<NearbyEntities> {
  const wanted = regionsInRadius(centerRegionId, radius);

  // Filtered against the directory listing rather than attempting (2r+1)^2 reads and
  // swallowing ENOENT: even at radius 2 that's 25 regions, and the overwhelming majority of
  // the world has no region file at all.
  const existing = new Set((await listRegionIds()).map((id) => id));
  const regionIds = wanted.filter((id) => existing.has(id));

  const citizens: CitizenInfo[] = [];
  const scenery: SceneryInfo[] = [];
  for (const regionId of regionIds) {
    const region = await readRegionOrEmpty(regionId);
    citizens.push(...(region.citizenRoster ?? []));
    scenery.push(...(region.sceneryRoster ?? []));
  }

  return { centerRegionId, radius, regionIds, citizens, scenery };
}

async function listRegionIds(): Promise<number[]> {
  const files = await fs.readdir(config.regionDataPath);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => Number(path.basename(f, ".json")))
    .filter((id) => Number.isInteger(id));
}

export async function listRegions(): Promise<RegionSummary[]> {
  const files = (await fs.readdir(config.regionDataPath)).filter((f) => f.endsWith(".json"));
  const summaries: RegionSummary[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(config.regionDataPath, file), "utf-8");
    const parsed = JSON.parse(raw) as CitizenRegionFile;
    summaries.push({
      regionId: parsed.regionId,
      citizenCount: parsed.citizenRoster?.length ?? 0,
      sceneryCount: parsed.sceneryRoster?.length ?? 0,
    });
  }

  summaries.sort((a, b) => a.regionId - b.regionId);
  return summaries;
}

export async function readRegion(regionId: number): Promise<CitizenRegionFile> {
  const raw = await fs.readFile(regionFilePath(regionId), "utf-8");
  return JSON.parse(raw) as CitizenRegionFile;
}

// Most of the world has no RegionData file at all, and the editor has to be able to open
// one of those regions and add the first citizen to it. Callers that are about to write
// use this rather than readRegion so a missing file behaves as an empty region instead of
// an error. Nothing is created on disk until an actual write happens.
export async function readRegionOrEmpty(regionId: number): Promise<CitizenRegionFile> {
  try {
    return await readRegion(regionId);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 0.8, regionId, citizenRoster: [], sceneryRoster: [] };
    }
    throw err;
  }
}

function assertValidCitizen(citizen: CitizenInfo): void {
  if (!citizen.modelIds || citizen.modelIds.length === 0) {
    throw new Error("modelIds must not be empty");
  }
  if ((citizen.modelRecolorFind?.length ?? 0) !== (citizen.modelRecolorReplace?.length ?? 0)) {
    throw new Error("modelRecolorFind and modelRecolorReplace must be the same length");
  }
  if (citizen.entityType === "WanderingCitizen") {
    const { wanderBoxBL: bl, wanderBoxTR: tr } = citizen;
    if (!bl || !tr) {
      throw new Error("WanderingCitizen requires wanderBoxBL and wanderBoxTR");
    }
    // Util.calculateBoundingBox throws on both of these, and the throw happens inside
    // loadRegion, so one bad box takes the whole region file down rather than just the
    // citizen that owns it.
    if (bl.x > tr.x || bl.y > tr.y) {
      throw new Error("wanderBoxBL must be to the bottom-left of wanderBoxTR");
    }
    if (Math.abs(tr.x - bl.x) <= 1 && Math.abs(tr.y - bl.y) <= 1) {
      throw new Error("Wander box must be larger than 1x1 (corners must span more than one tile on an axis)");
    }
    // The box plane is what WanderingCitizen actually wanders on, and Entity.shouldRender
    // gates on the citizen's own plane, so a mismatch renders a citizen that never moves.
    if (bl.plane !== tr.plane || bl.plane !== citizen.worldLocation.plane) {
      throw new Error("wanderBoxBL, wanderBoxTR and worldLocation must all be on the same plane");
    }
  }
  if (citizen.entityType === "Scenery") {
    throw new Error("entityType 'Scenery' belongs in sceneryRoster, not citizenRoster");
  }
}

function assertValidScenery(scenery: SceneryInfo): void {
  if (!scenery.modelIds || scenery.modelIds.length === 0) {
    throw new Error("modelIds must not be empty");
  }
  if ((scenery.modelRecolorFind?.length ?? 0) !== (scenery.modelRecolorReplace?.length ?? 0)) {
    throw new Error("modelRecolorFind and modelRecolorReplace must be the same length");
  }
}

// Gson (used by the Java plugin's own save path) defaults to htmlSafe mode, which escapes
// these five characters as \\uXXXX instead of writing them literally. JSON.stringify doesn't,
// so without this the two save paths fight over the same characters on every edit, producing
// pure escaping-style diff noise (e.g. "'" <-> "'") that looks like corruption but isn't -
// both forms are valid JSON and parse identically. Matching Gson's output keeps diffs to just
// the actual semantic change.
const GSON_HTML_SAFE_ESCAPES: Record<string, string> = {
  "&": "\\u0026",
  "<": "\\u003c",
  ">": "\\u003e",
  "=": "\\u003d",
  "'": "\\u0027",
};

function gsonHtmlSafeEscape(json: string): string {
  return json.replace(/[&<>=']/g, (ch) => GSON_HTML_SAFE_ESCAPES[ch]);
}

// Gson emits fields in Java *declaration* order, subclass before superclass - not the
// insertion order of whatever object this tool happens to build. These two lists mirror
// CitizenInfo.java (own fields) followed by EntityInfo.java (inherited).
//
// Applied ONLY to entities this tool creates or edits, never as a blanket pass over the
// whole file. Not every checked-in file is canonical Gson output - some entries were
// clearly hand-written (9273.json has `remarks` after `moveAnimation`; 12697.json has
// `idleAnimation` up in the subclass block) - so normalizing every entry on save would
// rewrite entries the user never touched. JSON.parse preserves key order and
// JSON.stringify follows insertion order, so untouched entries round-trip byte for byte
// on their own.
const ENTITY_KEY_ORDER = [
  "uuid",
  "regionId",
  "entityType",
  "worldLocation",
  "modelIds",
  "baseOrientation",
  "scale",
  "translate",
  "modelRecolorFind",
  "modelRecolorReplace",
  "idleAnimation",
  "removedObject",
  "mergedObjects",
] as const;

const CITIZEN_KEY_ORDER = [
  "name",
  "examineText",
  "remarks",
  "moveAnimation",
  "wanderBoxBL",
  "wanderBoxTR",
  "startScript",
  ...ENTITY_KEY_ORDER,
] as const;

// Gson skips null fields entirely rather than writing `"key": null`, so null/undefined are
// dropped here too. Empty arrays are NOT dropped - the plugin's own output keeps them
// (e.g. "modelRecolorFind": []), and Java-side defaults only apply to absent keys.
function inGsonOrder<T extends object>(value: T, order: readonly string[]): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    const field = (value as Record<string, unknown>)[key];
    if (field != null) {
      ordered[key] = field;
    }
  }
  return ordered;
}

// `scale` and `translate` are Java float[], which Gson writes with a mandatory decimal
// point ("0.0", "1.0"). JSON.parse collapses those to plain numbers and JSON.stringify
// writes them back as "0", silently reformatting every scale/translate line in any file
// that has them. The value is unchanged and Gson reads either form, but it's exactly the
// diff noise the htmlSafe escaping above exists to avoid. Numbers in those two arrays are
// therefore stringified via a sentinel and unwrapped afterwards.
const FLOAT_SENTINEL = "@@float@@";

function javaFloatLiteral(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function floatPreservingReplacer(key: string, value: unknown): unknown {
  if ((key === "scale" || key === "translate") && Array.isArray(value)) {
    return value.map((n) => (typeof n === "number" ? FLOAT_SENTINEL + javaFloatLiteral(n) : n));
  }
  return value;
}

// Exported so the round-trip test can assert that re-serializing an untouched, checked-in
// region file reproduces it byte for byte. That property is what makes a full-file rewrite
// safe: without it, editing one citizen would silently reformat every other entry.
export function serializeRegionFile(regionId: number, region: CitizenRegionFile): string {
  // Full-file rewrite, matching the existing Java plugin's own CitizenPanel/saveDirtyRegions
  // behavior - never a per-entity patch. `version` must stay exactly 0.8 (number) or the
  // Java loader will silently treat the whole file as invalid on next load.
  const toWrite = {
    version: 0.8,
    regionId,
    citizenRoster: region.citizenRoster ?? [],
    sceneryRoster: region.sceneryRoster ?? [],
  };
  const json = JSON.stringify(toWrite, floatPreservingReplacer, 4).replaceAll(
    new RegExp(`"${FLOAT_SENTINEL}([^"]*)"`, "g"),
    "$1",
  );
  // Trailing newline to match the existing Gson-pretty-printed files' formatting,
  // keeping git diffs to just the semantic change.
  return gsonHtmlSafeEscape(json) + "\n";
}

async function writeRegionFile(regionId: number, region: CitizenRegionFile): Promise<void> {
  await fs.writeFile(regionFilePath(regionId), serializeRegionFile(regionId, region), "utf-8");
}

function normalizeCitizen(citizen: CitizenInfo, regionId: number, uuid: string): CitizenInfo {
  const normalized: CitizenInfo = {
    ...citizen,
    uuid,
    regionId,
    // Must be an array and never null - Citizen.validate() on the Java side iterates it
    // with no null check and NPEs instead of raising a clean error.
    remarks: citizen.remarks ?? [],
    modelRecolorFind: citizen.modelRecolorFind ?? [],
    modelRecolorReplace: citizen.modelRecolorReplace ?? [],
    // Only meaningful for WanderingCitizen; carrying a stale box on a citizen that was
    // switched to another type would write fields the Java loader doesn't expect there.
    wanderBoxBL: citizen.entityType === "WanderingCitizen" ? citizen.wanderBoxBL : null,
    wanderBoxTR: citizen.entityType === "WanderingCitizen" ? citizen.wanderBoxTR : null,
    // Likewise startScript is a ScriptedCitizen-only field.
    startScript: citizen.entityType === "ScriptedCitizen" ? citizen.startScript : null,
  };
  // Reordered here, on the one entity being written, rather than across the whole file.
  return inGsonOrder(normalized, CITIZEN_KEY_ORDER) as unknown as CitizenInfo;
}

function normalizeScenery(scenery: SceneryInfo, regionId: number, uuid: string): SceneryInfo {
  const normalized: SceneryInfo = {
    ...scenery,
    uuid,
    regionId,
    entityType: "Scenery",
    modelRecolorFind: scenery.modelRecolorFind ?? [],
    modelRecolorReplace: scenery.modelRecolorReplace ?? [],
  };
  return inGsonOrder(normalized, ENTITY_KEY_ORDER) as unknown as SceneryInfo;
}

export async function createCitizen(regionId: number, citizen: CitizenInfo): Promise<CitizenRegionFile> {
  const region = await readRegionOrEmpty(regionId);
  // Ignores any uuid the client sent: uuids identify a citizen for the lifetime of the
  // data, and letting a create call choose one invites collisions with existing entries.
  const normalized = normalizeCitizen(citizen, regionId, randomUUID());
  assertValidCitizen(normalized);

  region.citizenRoster.push(normalized);
  await writeRegionFile(regionId, region);
  return region;
}

export async function updateCitizen(regionId: number, uuid: string, updated: CitizenInfo): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.citizenRoster.findIndex((c) => c.uuid === uuid);
  if (index === -1) {
    throw new Error(`Citizen ${uuid} not found in region ${regionId}`);
  }

  const normalized = normalizeCitizen(updated, regionId, uuid);
  assertValidCitizen(normalized);

  region.citizenRoster[index] = normalized;
  await writeRegionFile(regionId, region);
  return region;
}

export async function deleteCitizen(regionId: number, uuid: string): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.citizenRoster.findIndex((c) => c.uuid === uuid);
  if (index === -1) {
    throw new Error(`Citizen ${uuid} not found in region ${regionId}`);
  }

  region.citizenRoster.splice(index, 1);
  // The file is kept even when both rosters end up empty. An empty roster is valid to the
  // Java loader, and deleting the file would also throw away the region's presence in the
  // region list, which is how you navigate back to it.
  await writeRegionFile(regionId, region);
  return region;
}

export async function duplicateCitizen(regionId: number, uuid: string): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const source = region.citizenRoster.find((c) => c.uuid === uuid);
  if (!source) {
    throw new Error(`Citizen ${uuid} not found in region ${regionId}`);
  }

  const copy = normalizeCitizen(structuredClone(source), regionId, randomUUID());
  // Deliberately left at the same worldLocation rather than nudged one tile: two citizens
  // may legitimately share a tile, and silently moving the copy somewhere the caller didn't
  // ask for is harder to notice than a duplicate sitting exactly where it was spawned.
  copy.name = `${source.name} (copy)`;
  assertValidCitizen(copy);

  region.citizenRoster.push(copy);
  await writeRegionFile(regionId, region);
  return region;
}

export async function createScenery(regionId: number, scenery: SceneryInfo): Promise<CitizenRegionFile> {
  const region = await readRegionOrEmpty(regionId);
  const normalized = normalizeScenery(scenery, regionId, randomUUID());
  assertValidScenery(normalized);

  region.sceneryRoster.push(normalized);
  await writeRegionFile(regionId, region);
  return region;
}

export async function updateScenery(regionId: number, uuid: string, updated: SceneryInfo): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.sceneryRoster.findIndex((s) => s.uuid === uuid);
  if (index === -1) {
    throw new Error(`Scenery ${uuid} not found in region ${regionId}`);
  }

  const normalized = normalizeScenery(updated, regionId, uuid);
  assertValidScenery(normalized);

  region.sceneryRoster[index] = normalized;
  await writeRegionFile(regionId, region);
  return region;
}

export async function deleteScenery(regionId: number, uuid: string): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.sceneryRoster.findIndex((s) => s.uuid === uuid);
  if (index === -1) {
    throw new Error(`Scenery ${uuid} not found in region ${regionId}`);
  }

  region.sceneryRoster.splice(index, 1);
  await writeRegionFile(regionId, region);
  return region;
}

// Which citizens across every region point at a given script, so the editor can warn before
// changing a routine that more than one citizen shares.
export async function findScriptUsages(scriptName: string): Promise<{ regionId: number; uuid: string; name: string }[]> {
  const files = (await fs.readdir(config.regionDataPath)).filter((f) => f.endsWith(".json"));
  const usages: { regionId: number; uuid: string; name: string }[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(config.regionDataPath, file), "utf-8");
    const parsed = JSON.parse(raw) as CitizenRegionFile;
    for (const citizen of parsed.citizenRoster ?? []) {
      if (citizen.startScript === scriptName) {
        usages.push({ regionId: parsed.regionId, uuid: citizen.uuid, name: citizen.name });
      }
    }
  }

  return usages;
}

// Every citizen in every region file, for the "Citizens" tab of the entity browser. Reads
// the directory fresh each call: there are only a few dozen small files, and it means edits
// made by the plugin's in-game editor show up without restarting this server.
export async function listAllCitizens(): Promise<CitizenInfo[]> {
  const files = (await fs.readdir(config.regionDataPath)).filter((f) => f.endsWith(".json"));
  const all: CitizenInfo[] = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(config.regionDataPath, file), "utf-8");
    const parsed = JSON.parse(raw) as CitizenRegionFile;
    for (const citizen of parsed.citizenRoster ?? []) {
      // The file's regionId is authoritative - it's where edits must be written back.
      all.push({ ...citizen, regionId: parsed.regionId });
    }
  }
  all.sort((a, b) => a.name.localeCompare(b.name));
  return all;
}
