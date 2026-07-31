import { api } from "../api/client";
import { renderThumbnail } from "./thumbnailRenderer";

// One cache for the whole app, so switching tabs, paging back, or opening a map that shows
// the same models doesn't re-render anything already seen. Keyed on the exact render
// inputs, matching the server's own GLTF cache key.
//
// Lives outside ModelThumb because Leaflet markers need the data URL imperatively (to build
// a divIcon's HTML) rather than as React state - both paths must share one cache or the
// map and the roster would each render every model separately.
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function thumbKey(modelIds: number[], recolorFind: number[] = [], recolorReplace: number[] = []): string {
  return `${modelIds.join(",")}|${recolorFind.join(",")}|${recolorReplace.join(",")}`;
}

export function peekThumbnail(
  modelIds: number[],
  recolorFind: number[] = [],
  recolorReplace: number[] = [],
): string | null {
  return cache.get(thumbKey(modelIds, recolorFind, recolorReplace)) ?? null;
}

export function getThumbnail(
  modelIds: number[],
  recolorFind: number[] = [],
  recolorReplace: number[] = [],
): Promise<string> {
  const key = thumbKey(modelIds, recolorFind, recolorReplace);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  // Deduplicated: a region map and its roster can ask for the same model in the same tick,
  // and without this each would pay for its own render.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = api
    .render({ modelIds, recolorFind, recolorReplace })
    .then((gltf) => renderThumbnail(gltf))
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
 * Resolves many thumbnails with a bounded number of renders in flight, calling back as each
 * lands. A region with its neighbours can ask for 150+ thumbnails at once; firing them all
 * in parallel floods the render endpoint and stalls the shared WebGL renderer, so the map
 * would sit blank instead of filling in.
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
