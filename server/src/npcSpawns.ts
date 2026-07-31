import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { NearbyNpc } from "@citizens-helper/shared/src/types.js";
import { getEntity } from "./entityCatalog.js";

// Where NPCs actually stand is NOT in the game cache. The cache carries NPC *definitions*
// (name, models, animations) but spawn positions are server-side, so no amount of reading
// main_file_cache.dat2 will produce them - see MapLoader, whose location records are object
// ids only.
//
// This is the dataset behind the OSRS Wiki's map, published by the same author as the map
// tiles this tool already renders (mejrs), so it's not a new external dependency so much as
// a second file from one we already trust.
const SOURCE_URL = "https://raw.githubusercontent.com/mejrs/data_osrs/master/NPCList_OSRS.json";

// ~9.5MB / 24k spawns. Cached to disk on first use so the tool keeps working offline and
// doesn't re-download on every server restart.
const CACHE_FILE = fileURLToPath(new URL("../.cache/NPCList_OSRS.json", import.meta.url));

type RawSpawn = {
  id: number;
  name?: string;
  // Plane. Named `p` in the source data.
  p?: number;
  x: number;
  y: number;
};

function regionIdOf(x: number, y: number): number {
  return ((Math.floor(x / 64) << 8) | Math.floor(y / 64)) >>> 0;
}

async function readFromDisk(): Promise<RawSpawn[] | null> {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf-8")) as RawSpawn[];
  } catch {
    return null;
  }
}

async function download(): Promise<RawSpawn[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`${SOURCE_URL} returned ${res.status}`);
  }
  const text = await res.text();
  const parsed = JSON.parse(text) as RawSpawn[];
  // Written after parsing, so a truncated or HTML error response never lands in the cache
  // as a file that then fails on every subsequent startup.
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, text, "utf-8");
  return parsed;
}

let indexPromise: Promise<Map<number, RawSpawn[]>> | null = null;

/**
 * Region-indexed spawn table, loaded once per process.
 *
 * Deliberately fail-soft: this is a nice-to-have reference layer on top of the plugin's own
 * data, so no-network / rate-limited / bad-JSON must degrade to "no game NPCs shown" rather
 * than breaking the region map entirely.
 */
function loadIndex(): Promise<Map<number, RawSpawn[]>> {
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    let spawns: RawSpawn[];
    try {
      spawns = (await readFromDisk()) ?? (await download());
    } catch (err) {
      console.warn(
        "npcSpawns: could not load game NPC spawn data, the region map will show only plugin entities:",
        err instanceof Error ? err.message : err,
      );
      return new Map<number, RawSpawn[]>();
    }

    const index = new Map<number, RawSpawn[]>();
    for (const spawn of spawns) {
      if (typeof spawn?.x !== "number" || typeof spawn?.y !== "number") continue;
      const regionId = regionIdOf(spawn.x, spawn.y);
      const bucket = index.get(regionId);
      if (bucket) bucket.push(spawn);
      else index.set(regionId, [spawn]);
    }
    return index;
  })();

  return indexPromise;
}

/**
 * The distinct NPCs appearing anywhere in the given regions, sorted by how common they are.
 *
 * Deduplicated by npc id rather than returned per-spawn: an area typically has one NPC id
 * standing in a dozen places (bankers, guards, rats), and this list exists to be browsed and
 * cloned from, where a dozen identical rows is pure noise.
 */
export async function readNearbyNpcs(regionIds: number[]): Promise<NearbyNpc[]> {
  const index = await loadIndex();

  const counts = new Map<number, { name: string; count: number }>();
  for (const regionId of regionIds) {
    for (const spawn of index.get(regionId) ?? []) {
      const seen = counts.get(spawn.id);
      if (seen) seen.count++;
      else counts.set(spawn.id, { name: spawn.name ?? `NPC ${spawn.id}`, count: 1 });
    }
  }

  const resolved: NearbyNpc[] = [];
  for (const [npcId, { name, count }] of counts) {
    // Models come from our own cache rather than the spawn file: many entries carry no
    // `models` field at all (they use `morphs` instead), and the cache is the same source
    // the entity browser and renderer use, so a cloned citizen looks like the thumbnail.
    const detail = await getEntity("npc", npcId);
    const body = detail?.variants.find((v) => v.label === "Body") ?? detail?.variants[0];
    // Skipped entirely rather than listed as an empty card: an NPC with no models can't be
    // previewed and can't be cloned into a valid citizen, which is the only thing this list
    // is for.
    if (!detail || !body || body.modelIds.length === 0) continue;

    resolved.push({
      npcId,
      name,
      spawnCount: count,
      modelIds: body.modelIds,
      recolorFind: detail.recolorFind,
      recolorReplace: detail.recolorReplace,
    });
  }

  resolved.sort((a, b) => b.spawnCount - a.spawnCount || a.name.localeCompare(b.name));
  return resolved;
}
