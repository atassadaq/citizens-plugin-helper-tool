import { IndexType, ConfigType, ModelGroup, GLTFExporter } from "osrscachereader";
import type { RenderRequest } from "@citizens-helper/shared/src/types.js";
import { cache } from "./rsCache.js";

// Cache-data-derived output is valid for the life of the process (the underlying
// game cache doesn't change while this server runs), so a plain in-memory Map is
// enough - no TTL/eviction needed for a personal dev tool.
const gltfCache = new Map<string, string>();

function cacheKey(req: RenderRequest): string {
  return [
    req.modelIds.join(","),
    req.recolorFind.join(","),
    req.recolorReplace.join(","),
    req.animationId ?? "",
  ].join("|");
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

  if (req.animationId != null) {
    await addSequence(exporter, req.animationId, req.modelIds);
  }

  const gltf = exporter.export();

  gltfCache.set(key, gltf);
  return gltf;
}

// Bakes every frame of the sequence into the GLTF as morph targets plus one animation
// track. Deliberately fail-soft: a model with no vertex skins (most scenery, and plenty of
// item models) simply can't be posed, and an appearance that mixes animatable and static
// parts is a normal thing to be previewing. Losing the whole preview in that case would be
// worse than losing the motion, so the static export is still returned and the client
// reports the missing animation from the empty `animations` array.
async function addSequence(exporter: GLTFExporter, animationId: number, modelIds: number[]): Promise<void> {
  try {
    const seq = (await cache.getFile(IndexType.CONFIGS.id, ConfigType.SEQUENCE.id, animationId)).def;
    if (!seq) {
      console.warn(`render: sequence ${animationId} not found in cache`);
      return;
    }
    await exporter.addSequence(cache, seq);
  } catch (err) {
    console.warn(
      `render: could not apply animation ${animationId} to models [${modelIds.join(",")}]:`,
      err instanceof Error ? err.message : err,
    );
  }
}
