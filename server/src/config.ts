import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Resolve relative to this file rather than process.cwd(), since npm workspaces
// run "dev" scripts with cwd set to the workspace package dir (server/), not the repo root.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}

const citizensRepoPath = required("CITIZENS_REPO_PATH");
const jagexCachePath = required("JAGEX_CACHE_PATH");
const regionDataPath =
  process.env.REGION_DATA_PATH ?? path.join(citizensRepoPath, "src", "main", "resources", "RegionData");
// Sibling of RegionData. Scripts hold ScriptedCitizen movement routines, referenced from a
// citizen's `startScript` by bare filename (see ScriptLoader.java).
const scriptsPath = process.env.SCRIPTS_PATH ?? path.join(citizensRepoPath, "src", "main", "resources", "Scripts");
// API_PORT rather than PORT: dev launchers commonly export PORT for the web client (5173),
// and dotenv never overrides an existing variable, so the API would silently take it.
const port = Number(process.env.API_PORT ?? 5175);

if (!fs.existsSync(regionDataPath)) {
  throw new Error(
    `RegionData path does not exist: ${regionDataPath}. Check CITIZENS_REPO_PATH (or REGION_DATA_PATH) in .env.`,
  );
}

if (!fs.existsSync(scriptsPath)) {
  throw new Error(
    `Scripts path does not exist: ${scriptsPath}. Check CITIZENS_REPO_PATH (or SCRIPTS_PATH) in .env.`,
  );
}

const cacheDatFile = path.join(jagexCachePath, "main_file_cache.dat2");
if (!fs.existsSync(cacheDatFile)) {
  throw new Error(
    `Jagex cache not found at ${cacheDatFile}. Check JAGEX_CACHE_PATH in .env, and make sure ` +
      `you've logged into RuneLite at least once so the cache is downloaded locally.`,
  );
}

export const config = {
  citizensRepoPath,
  jagexCachePath,
  regionDataPath,
  scriptsPath,
  port,
};
