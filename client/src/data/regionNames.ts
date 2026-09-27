import { OSRS_LOCATIONS } from "./osrsLocations";

// Bare region ids ("12850") mean nothing to most people; "Lumbridge" does. This names a
// region after the closest well-known place whose label point is inside it or within about
// one region of it, preferring bigger places (lower tier) when two are equally close.
const cache = new Map<number, string | null>();

const MAX_DISTANCE_TILES = 72;

export function regionName(regionId: number): string | null {
  if (cache.has(regionId)) return cache.get(regionId)!;
  const cx = (regionId >> 8) * 64 + 32;
  const cy = (regionId & 0xff) * 64 + 32;
  let best: { name: string; score: number } | null = null;
  for (const loc of OSRS_LOCATIONS) {
    const d = Math.hypot(loc.x - cx, loc.y - cy);
    if (d > MAX_DISTANCE_TILES) continue;
    // A tier step is worth ~24 tiles of distance, so a city a little further away beats a
    // landmark right next door.
    const score = d + loc.tier * 24;
    if (!best || score < best.score) best = { name: loc.name, score };
  }
  const name = best?.name ?? null;
  cache.set(regionId, name);
  return name;
}

export function regionLabel(regionId: number): string {
  const name = regionName(regionId);
  return name ? `${name} (${regionId})` : `Region ${regionId}`;
}
