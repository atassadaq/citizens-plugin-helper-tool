import { Router } from "express";
import type { CitizenInfo, SceneryInfo } from "@citizens-helper/shared/src/types.js";
import { listRegions, readRegion, updateCitizen, updateScenery } from "../regionRepo.js";

export const regionsRouter = Router();

regionsRouter.get("/regions", async (_req, res) => {
  try {
    res.json(await listRegions());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

regionsRouter.get("/regions/:regionId", async (req, res) => {
  const regionId = Number(req.params.regionId);
  try {
    res.json(await readRegion(regionId));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

regionsRouter.post("/regions/:regionId/citizens/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  const uuid = req.params.uuid;
  try {
    const region = await updateCitizen(regionId, uuid, req.body as CitizenInfo);
    res.json(region);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

regionsRouter.post("/regions/:regionId/scenery/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  const uuid = req.params.uuid;
  try {
    const region = await updateScenery(regionId, uuid, req.body as SceneryInfo);
    res.json(region);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
