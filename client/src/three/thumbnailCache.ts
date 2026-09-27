import { api } from "../api/client";
import { renderThumbnail } from "./thumbnailRenderer";

// One cache for the whole app, so switching tabs, paging back, or opening a map that shows
// the same models doesn't re-render anything already seen. Keyed on the exact render
// inputs, matching the server's own GLTF cache key.
//
// Three layers, cheapest first:
//   1. in-memory Map        - instant, lives for the page session
//   2. IndexedDB            - survives reloads, so reopening the tool is instant instead of
//                              re-rendering every roster thumbnail from scratch
//   3. render queue         - server GLTF export + one shared WebGL renderer, with a small
//                              concurrency cap so a 150-entity map can't flood either
//
// Lives outside ModelThumb because Leaflet markers need the data URL imperatively (to build
// a divIcon's HTML) rather than as React state - both paths must share one cache.
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

// Bump when renderThumbnail's framing/lighting changes, so stale persisted images are ignored.
const THUMB_VERSION = 1;
const MAX_CONCURRENT_RENDERS = 4;

export function thumbKey(modelIds: number[], recolorFind: number[] = [], recolorReplace: number[] = []): string {
  return `${modelIds.join(",")}|${recolorFind.join(",")}|${recolorReplace.join(",")}`;
}

export function peekThumbnail(modelIds: number[], recolorFind: number[] = [], recolorReplace: number[] = []): string | null {
  return cache.get(thumbKey(modelIds, recolorFind, recolorReplace)) ?? null;
}

// ---- IndexedDB persistence (best effort: any failure just falls through to rendering) ----

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open("citizens-helper", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("thumbs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction("thumbs").objectStore("thumbs").get(`${THUMB_VERSION}:${key}`);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction("thumbs", "readwrite").objectStore("thumbs").put(value, `${THUMB_VERSION}:${key}`);
  } catch {
    // Quota or private mode - the in-memory cache still works.
  }
}

// ---- Render queue -----------------------------------------------------------------------

let active = 0;
const queue: (() => void)[] = [];

function withRenderSlot<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active++;
      work()
        .then(resolve, reject)
        .finally(() => {
          active--;
          queue.shift()?.();
        });
    };
    if (active < MAX_CONCURRENT_RENDERS) run();
    else queue.push(run);
  });
}

export function getThumbnail(modelIds: number[], recolorFind: number[] = [], recolorReplace: number[] = []): Promise<string> {
  const key = thumbKey(modelIds, recolorFind, recolorReplace);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  // Deduplicated: a region map and its roster can ask for the same model in the same tick,
  // and without this each would pay for its own render.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = idbGet(key)
    .then(
      (persisted) =>
        persisted ??
        withRenderSlot(() => api.render({ modelIds, recolorFind, recolorReplace }).then((gltf) => renderThumbnail(gltf))).then(
          (dataUrl) => {
            void idbPut(key, dataUrl);
            return dataUrl;
          },
        ),
    )
    .then((dataUrl) => {
      cache.set(key, dataUrl);
      inFlight.delete(key);
      return dataUrl;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Resolves many thumbnails, calling back as each lands. Concurrency is already bounded by
 * the shared render queue; this just walks the list and supports cancellation.
 *
 * Returns a cancel function - callers must invoke it on unmount so a slow batch can't keep
 * calling back into a dead component.
 */
export function resolveThumbnails(
  requests: { key: string; modelIds: number[]; recolorFind: number[]; recolorReplace: number[] }[],
  onResolved: (key: string, dataUrl: string) => void,
  concurrency = 6,
): () => void {
  let cancelled = false;
  let next = 0;

  const pump = async (): Promise<void> => {
    while (!cancelled) {
      const index = next++;
      if (index >= requests.length) return;
      const req = requests[index];
      try {
        const dataUrl = await getThumbnail(req.modelIds, req.recolorFind, req.recolorReplace);
        if (!cancelled) onResolved(req.key, dataUrl);
      } catch {
        // A model that won't render is expected (bad ids in hand-authored data); the marker
        // just keeps its plain dot.
      }
    }
  };

  for (let i = 0; i < Math.min(concurrency, requests.length); i++) {
    void pump();
  }

  return () => {
    cancelled = true;
  };
}
