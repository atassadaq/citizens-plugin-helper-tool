import { IndexType, ModelGroup, GLTFExporter } from "osrscachereader";
import type { RenderRequest } from "@citizens-helper/shared/src/types.js";
import { cache } from "./rsCache.js";

// Cache-data-derived output is valid for the life of the process (the underlying
// game cache doesn't change while this server runs), so a plain in-memory Map is
// enough - no TTL/eviction needed for a personal dev tool.
const gltfCache = new Map<string, string>();

function cacheKey(req: RenderRequest): string {
  return `${req.modelIds.join(",")}|${req.recolorFind.join(",")}|${req.recolorReplace.join(",")}`;
}

export async function renderModels(req: RenderRequest): Promise<string> {
  const key = cacheKey(req);
  const cached = gltfCache.get(key);
  if (cached) {
    return cached;
  }

  const group = new ModelGroup();
  for (const id of req.modelIds) {
    const model = await cache.getDef(IndexType.MODELS, id);
    for (let i = 0; i < req.recolorFind.length; i++) {
      model.recolor(req.recolorFind[i], req.recolorReplace[i]);
    }
    group.addModel(model);
  }

  const merged = group.getMergedModel();
  const exporter = new GLTFExporter(merged);
  exporter.addColors(merged);
  const gltf = exporter.export();

  gltfCache.set(key, gltf);
  return gltf;
}
