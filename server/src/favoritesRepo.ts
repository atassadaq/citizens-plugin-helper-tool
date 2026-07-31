import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types.js";

// Lives in the helper tool's own repo (server/data/), not under RegionData/Scripts in
// citizensRunelite - favorites aren't part of the Java plugin's Gson contract, so they
// get their own file rather than risking confusion with the plugin's own save routines.
const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const favoritesFile = path.join(dataDir, "favorites.json");

async function readAll(): Promise<FavoriteEntry[]> {
  try {
    const raw = await fs.readFile(favoritesFile, "utf-8");
    return JSON.parse(raw) as FavoriteEntry[];
  } catch (err) {
    // Missing file is the normal state for a fresh install - favorites aren't required
    // for the tool to function, unlike RegionData/the cache path in config.ts.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeAll(entries: FavoriteEntry[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(favoritesFile, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

export async function listFavorites(): Promise<FavoriteEntry[]> {
  return readAll();
}

// Upserts by key: re-favoriting an already-present key overwrites it in place rather than
// producing a duplicate, so a stale client retrying a request can't create two entries.
export async function addFavorite(entry: Omit<FavoriteEntry, "savedAt">): Promise<FavoriteEntry> {
  if (!entry.key || !entry.kind) {
    throw new Error("favorite must have a key and kind");
  }
  const entries = await readAll();
  const full: FavoriteEntry = { ...entry, savedAt: new Date().toISOString() };
  const next = [...entries.filter((e) => e.key !== full.key), full];
  await writeAll(next);
  return full;
}

// Idempotent: removing a key that isn't present is not an error (two tabs open, one
// already removed it).
export async function removeFavorite(key: string): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((e) => e.key !== key));
}
