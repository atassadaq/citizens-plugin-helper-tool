import { Router } from "express";
import { getKitsByBodyPart, listBodyParts } from "../kitCatalog.js";

export const kitsRouter = Router();

kitsRouter.get("/kits/bodyParts", async (_req, res) => {
  try {
    res.json(await listBodyParts());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

kitsRouter.get("/kits/:bodyPartId", async (req, res) => {
  const bodyPartId = Number(req.params.bodyPartId);
  if (!Number.isInteger(bodyPartId) || bodyPartId < 0) {
    res.status(400).json({ error: "bodyPartId must be a non-negative integer" });
    return;
  }

  try {
    const kits = await getKitsByBodyPart(bodyPartId);
    res.json(kits);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
