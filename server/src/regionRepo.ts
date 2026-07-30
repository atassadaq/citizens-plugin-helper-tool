import fs from "fs/promises";
import path from "path";
import type { CitizenInfo, CitizenRegionFile, RegionSummary, SceneryInfo } from "@citizens-helper/shared/src/types.js";
import { config } from "./config.js";

function regionFilePath(regionId: number): string {
  return path.join(config.regionDataPath, `${regionId}.json`);
}

export async function listRegions(): Promise<RegionSummary[]> {
  const files = (await fs.readdir(config.regionDataPath)).filter((f) => f.endsWith(".json"));
  const summaries: RegionSummary[] = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(config.regionDataPath, file), "utf-8");
    const parsed = JSON.parse(raw) as CitizenRegionFile;
    summaries.push({
      regionId: parsed.regionId,
      citizenCount: parsed.citizenRoster?.length ?? 0,
      sceneryCount: parsed.sceneryRoster?.length ?? 0,
    });
  }

  summaries.sort((a, b) => a.regionId - b.regionId);
  return summaries;
}

export async function readRegion(regionId: number): Promise<CitizenRegionFile> {
  const raw = await fs.readFile(regionFilePath(regionId), "utf-8");
  return JSON.parse(raw) as CitizenRegionFile;
}

function assertValidCitizen(citizen: CitizenInfo): void {
  if (!citizen.modelIds || citizen.modelIds.length === 0) {
    throw new Error("modelIds must not be empty");
  }
  if ((citizen.modelRecolorFind?.length ?? 0) !== (citizen.modelRecolorReplace?.length ?? 0)) {
    throw new Error("modelRecolorFind and modelRecolorReplace must be the same length");
  }
  if (citizen.entityType === "WanderingCitizen" && (!citizen.wanderBoxBL || !citizen.wanderBoxTR)) {
    throw new Error("WanderingCitizen requires wanderBoxBL and wanderBoxTR");
  }
}

async function writeRegionFile(regionId: number, region: CitizenRegionFile): Promise<void> {
  // Full-file rewrite, matching the existing Java plugin's own CitizenPanel/saveDirtyRegions
  // behavior - never a per-entity patch. `version` must stay exactly 0.8 (number) or the
  // Java loader will silently treat the whole file as invalid on next load.
  const toWrite: CitizenRegionFile = { ...region, version: 0.8, regionId };
  // Trailing newline to match the existing Gson-pretty-printed files' formatting,
  // keeping git diffs to just the semantic change.
  await fs.writeFile(regionFilePath(regionId), JSON.stringify(toWrite, null, 4) + "\n", "utf-8");
}

export async function updateCitizen(regionId: number, uuid: string, updated: CitizenInfo): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.citizenRoster.findIndex((c) => c.uuid === uuid);
  if (index === -1) {
    throw new Error(`Citizen ${uuid} not found in region ${regionId}`);
  }

  const normalized: CitizenInfo = {
    ...updated,
    uuid,
    regionId,
    remarks: updated.remarks ?? [],
  };
  assertValidCitizen(normalized);

  region.citizenRoster[index] = normalized;
  await writeRegionFile(regionId, region);
  return region;
}

export async function updateScenery(regionId: number, uuid: string, updated: SceneryInfo): Promise<CitizenRegionFile> {
  const region = await readRegion(regionId);
  const index = region.sceneryRoster.findIndex((s) => s.uuid === uuid);
  if (index === -1) {
    throw new Error(`Scenery ${uuid} not found in region ${regionId}`);
  }
  if (!updated.modelIds || updated.modelIds.length === 0) {
    throw new Error("modelIds must not be empty");
  }
  if ((updated.modelRecolorFind?.length ?? 0) !== (updated.modelRecolorReplace?.length ?? 0)) {
    throw new Error("modelRecolorFind and modelRecolorReplace must be the same length");
  }

  region.sceneryRoster[index] = { ...updated, uuid, regionId };
  await writeRegionFile(regionId, region);
  return region;
}
