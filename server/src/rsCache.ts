import { RSCache } from "osrscachereader";
import { config } from "./config.js";

// Singleton, created once and kept warm for the process lifetime. Re-instantiating
// RSCache per request would repeatedly re-pay the cache-index loading cost.
export const cache = new RSCache(config.jagexCachePath);

// NOTE: loading logs a benign "error reading index 16 pos 0 RangeError..." to the
// console - that's IndexType.WORLDMAP (world-map data), unrelated to model loading.
// It's expected and does not affect anything this tool does.

export const cacheReady: Promise<void> = cache.onload.then(() => undefined);
