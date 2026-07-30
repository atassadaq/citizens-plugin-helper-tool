import { Router } from "express";
import type { StatusResponse } from "@citizens-helper/shared/src/types.js";
import { config } from "../config.js";
import { cacheReady } from "../rsCache.js";

export const statusRouter = Router();

let ready = false;
cacheReady.then(() => {
  ready = true;
});

statusRouter.get("/status", (_req, res) => {
  const body: StatusResponse = {
    cacheReady: ready,
    repoPath: config.citizensRepoPath,
    cachePath: config.jagexCachePath,
    regionDataPath: config.regionDataPath,
  };
  res.json(body);
});
