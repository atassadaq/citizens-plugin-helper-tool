import { Router, type Response } from "express";
import type { CitizenInfo, SceneryInfo } from "@citizens-helper/shared/src/types.js";
import {
  createCitizen,
  createScenery,
  deleteCitizen,
  deleteScenery,
  duplicateCitizen,
  listRegions,
  readNearbyEntities,
  readRegionOrEmpty,
  regionsInRadius,
  updateCitizen,
  updateScenery,
} from "../regionRepo.js";

export const regionsRouter = Router();

// Every mutating handler shares this: repo errors are all caller-fixable validation
// problems ("modelIds must not be empty", "citizen not found"), so they map to 400.
async function respond(res: Response, work: () => Promise<unknown>): Promise<void> {
  try {
    res.json(await work());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

regionsRouter.get("/regions", async (_req, res) => {
  try {
    res.json(await listRegions());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Returns an empty roster for regions with no file on disk rather than 404 - the editor
// has to be able to open any region on the map and add the first citizen to it.
regionsRouter.get("/regions/:regionId", async (req, res) => {
  const regionId = Number(req.params.regionId);
  try {
    res.json(await readRegionOrEmpty(regionId));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Everything in the surrounding block of regions, so a region map can draw its neighbours'
// citizens and scenery as context rather than cutting off at the region boundary.
const MAX_NEARBY_RADIUS = 10;

regionsRouter.get("/regions/:regionId/nearby", async (req, res) => {
  const regionId = Number(req.params.regionId);
  const requested = Number(req.query.radius ?? 5);
  if (!Number.isInteger(regionId)) {
    res.status(400).json({ error: "regionId must be an integer" });
    return;
  }
  // Clamped rather than rejected: radius is a display preference, and (2r+1)^2 file reads
  // grows quadratically, so an accidental `?radius=500` shouldn't stall the server.
  const radius = Number.isInteger(requested) ? Math.min(Math.max(requested, 0), MAX_NEARBY_RADIUS) : 5;
  try {
    res.json(await readNearbyEntities(regionId, radius));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Distinct game NPCs found around a region, as a source to clone citizens from. Separate
// from /nearby because it needs the spawn dataset (a one-off 9.5MB download on first use)
// and the game cache, neither of which the map view should have to wait for.
regionsRouter.get("/regions/:regionId/npcs", async (req, res) => {
  const regionId = Number(req.params.regionId);
  const requested = Number(req.query.radius ?? 2);
  if (!Number.isInteger(regionId)) {
    res.status(400).json({ error: "regionId must be an integer" });
    return;
  }
  const radius = Number.isInteger(requested) ? Math.min(Math.max(requested, 0), MAX_NEARBY_RADIUS) : 2;
  try {
    // Imported lazily: npcSpawns pulls in entityCatalog -> rsCache, which loads the whole
    // game cache as an import side effect. regionRepo is also used by tooling that only
    // touches JSON on disk (scripts/checkRegionRoundTrip.mjs), which must not pay for that.
    const { readNearbyNpcs } = await import("../npcSpawns.js");
    res.json(await readNearbyNpcs(regionsInRadius(regionId, radius)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

regionsRouter.post("/regions/:regionId/citizens", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => createCitizen(regionId, req.body as CitizenInfo));
});

regionsRouter.post("/regions/:regionId/citizens/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => updateCitizen(regionId, req.params.uuid, req.body as CitizenInfo));
});

regionsRouter.post("/regions/:regionId/citizens/:uuid/duplicate", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => duplicateCitizen(regionId, req.params.uuid));
});

regionsRouter.delete("/regions/:regionId/citizens/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => deleteCitizen(regionId, req.params.uuid));
});

regionsRouter.post("/regions/:regionId/scenery", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => createScenery(regionId, req.body as SceneryInfo));
});

regionsRouter.post("/regions/:regionId/scenery/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => updateScenery(regionId, req.params.uuid, req.body as SceneryInfo));
});

regionsRouter.delete("/regions/:regionId/scenery/:uuid", async (req, res) => {
  const regionId = Number(req.params.regionId);
  await respond(res, () => deleteScenery(regionId, req.params.uuid));
});
