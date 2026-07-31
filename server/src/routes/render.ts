import { Router } from "express";
import type { RenderRequest } from "@citizens-helper/shared/src/types.js";
import { renderModels } from "../renderService.js";

export const renderRouter = Router();

renderRouter.post("/render", async (req, res) => {
  const body = req.body as RenderRequest;
  if (!Array.isArray(body.modelIds) || body.modelIds.length === 0) {
    res.status(400).json({ error: "modelIds must be a non-empty array" });
    return;
  }
  const recolorFind = body.recolorFind ?? [];
  const recolorReplace = body.recolorReplace ?? [];
  if (recolorFind.length !== recolorReplace.length) {
    res.status(400).json({ error: "recolorFind and recolorReplace must be the same length" });
    return;
  }

  const animationId = typeof body.animationId === "number" ? body.animationId : null;

  try {
    const gltf = await renderModels({ modelIds: body.modelIds, recolorFind, recolorReplace, animationId });
    res.type("application/json").send(gltf);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
