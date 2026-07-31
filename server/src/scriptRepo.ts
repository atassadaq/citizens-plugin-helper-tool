import fs from "fs/promises";
import path from "path";
import type { ScriptFile, ScriptSummary } from "@citizens-helper/shared/src/types.js";
import { config } from "./config.js";
import { findScriptUsages } from "./regionRepo.js";

// Scripts are referenced from a citizen's `startScript` by bare name with no path or
// extension (ScriptLoader.java does getResourceAsStream("/Scripts/" + name + ".json")),
// so the file name IS the identity - renaming one silently orphans every citizen using it.
function scriptFilePath(name: string): string {
  return path.join(config.scriptsPath, `${name}.json`);
}

// Guards against a name escaping the Scripts directory or producing something the Java
// resource lookup can't find. Deliberately strict: these names are typed by hand into a
// field that becomes a file path.
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

export function assertValidScriptName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `Invalid script name '${name}'. Use only letters, numbers, hyphens and underscores ` +
        `(the name becomes the Scripts/<name>.json filename referenced by startScript).`,
    );
  }
}

export async function listScripts(): Promise<ScriptSummary[]> {
  const files = (await fs.readdir(config.scriptsPath)).filter((f) => f.endsWith(".json"));
  const summaries: ScriptSummary[] = [];

  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const raw = await fs.readFile(path.join(config.scriptsPath, file), "utf-8");
    const parsed = JSON.parse(raw) as ScriptFile;
    summaries.push({
      name,
      actionCount: parsed.actions?.length ?? 0,
      usedBy: await findScriptUsages(name),
    });
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function readScript(name: string): Promise<ScriptFile> {
  assertValidScriptName(name);
  const raw = await fs.readFile(scriptFilePath(name), "utf-8");
  const parsed = JSON.parse(raw) as ScriptFile;
  // ScriptFile.java also declares `name`, but it's assigned by ScriptLoader after parsing
  // (script.name = scriptName), never read from the file - so it's absent from the
  // checked-in scripts and isn't written back here either.
  return { actions: parsed.actions ?? [] };
}

function assertValidScript(script: ScriptFile): void {
  if (!Array.isArray(script.actions)) {
    throw new Error("script must have an `actions` array");
  }
  for (const [i, action] of script.actions.entries()) {
    if (!action.action) {
      throw new Error(`action ${i} is missing its action type`);
    }
    if (action.action === "WalkTo" && !action.targetPosition) {
      throw new Error(`action ${i} is a WalkTo with no targetPosition`);
    }
    if (action.action === "Animation" && !action.animationId) {
      throw new Error(`action ${i} is an Animation with no animationId`);
    }
    if (action.action === "Say" && !action.message) {
      throw new Error(`action ${i} is a Say with no message`);
    }
    if (action.action === "FaceDirection" && !action.targetRotation) {
      throw new Error(`action ${i} is a FaceDirection with no targetRotation`);
    }
  }
}

// Mirrors ScriptAction.java's field declaration order, for the same Gson-diff-stability
// reason as regionRepo's citizen ordering.
const ACTION_KEY_ORDER = [
  "action",
  "secondsTilNextAction",
  "timesToLoop",
  "targetPosition",
  "message",
  "animationId",
  "scriptName",
  "targetRotation",
] as const;

function inGsonOrder(action: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of ACTION_KEY_ORDER) {
    if (action[key] != null) {
      ordered[key] = action[key];
    }
  }
  return ordered;
}

export function serializeScript(script: ScriptFile): string {
  const toWrite = { actions: script.actions.map((a) => inGsonOrder(a as unknown as Record<string, unknown>)) };
  return JSON.stringify(toWrite, null, 4) + "\n";
}

export async function writeScript(name: string, script: ScriptFile): Promise<ScriptFile> {
  assertValidScriptName(name);
  assertValidScript(script);
  await fs.writeFile(scriptFilePath(name), serializeScript(script), "utf-8");
  return script;
}

export async function deleteScript(name: string): Promise<void> {
  assertValidScriptName(name);
  // Refuses while any citizen still points at it: ScriptLoader returns null for a missing
  // file and ScriptedCitizen just silently never moves, which is near-impossible to debug
  // from the plugin side.
  const usages = await findScriptUsages(name);
  if (usages.length > 0) {
    const who = usages.map((u) => `${u.name} (region ${u.regionId})`).join(", ");
    throw new Error(`Script '${name}' is still used by ${usages.length} citizen(s): ${who}`);
  }
  await fs.unlink(scriptFilePath(name));
}
