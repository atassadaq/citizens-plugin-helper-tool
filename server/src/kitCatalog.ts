import { ConfigType, IndexType, type KitDefinition } from "osrscachereader";
import type { KitSummary } from "@citizens-helper/shared/src/types.js";
import { cache, cacheReady } from "./rsCache.js";

// Identikit bodyPartId is the character-creation slot, NOT RuneLite's KitType equipment-slot
// enum (HEAD=0, CAPE=1, ... - a different numbering). Male slots are 0-6 and the female
// equivalents 7-13. Verified against rendered kits in the live cache (2026-09): 1 renders
// beards, 2 torsos, 4 pairs of hands, 5 trousers, 6 boots. An earlier version labelled 4 as
// "Torso" and 7 as generic "Hair" - both wrong - so trust these over older notes.
const BODY_PART_NAMES: Record<number, string> = {
  0: "Hair",
  1: "Beard",
  2: "Torso",
  3: "Arms",
  4: "Hands",
  5: "Legs",
  6: "Feet",
  7: "Hair (F)",
  8: "Jaw (F)",
  9: "Torso (F)",
  10: "Arms (F)",
  11: "Hands (F)",
  12: "Legs (F)",
  13: "Feet (F)",
};

export type BodyPart = { bodyPartId: number; name: string };

// All identikit defs, loaded once and kept for the process lifetime - there are only ~300
// of them and, like model/render data, they don't change while this server runs.
// Explicitly typed rather than inferred via ReturnType: getAllDefs is overloaded per
// ConfigType, and ReturnType<> on an overloaded function silently picks the last overload.
let allKitsPromise: Promise<(KitDefinition | null)[]> | null = null;

function loadAllKits(): Promise<(KitDefinition | null)[]> {
  if (!allKitsPromise) {
    allKitsPromise = cacheReady.then(() => cache.getAllDefs(IndexType.CONFIGS, ConfigType.IDENTKIT));
  }
  return allKitsPromise;
}

// Unused id slots come back as null, so every read filters them out first.
function usableKits(kits: (KitDefinition | null)[]): KitDefinition[] {
  return kits.filter((kit): kit is KitDefinition => kit != null && kit.models.length > 0);
}

export async function listBodyParts(): Promise<BodyPart[]> {
  const kits = usableKits(await loadAllKits());
  const ids = new Set(kits.map((kit) => kit.bodyPartId));
  return [...ids].sort((a, b) => a - b).map((bodyPartId) => ({
    bodyPartId,
    name: BODY_PART_NAMES[bodyPartId] ?? `Group ${bodyPartId}`,
  }));
}

export async function getKitsByBodyPart(bodyPartId: number): Promise<KitSummary[]> {
  const kits = usableKits(await loadAllKits());
  return kits
    .filter((kit) => kit.bodyPartId === bodyPartId)
    .map((kit) => ({
      id: kit.id,
      models: kit.models,
      recolorFind: kit.recolorToFind ?? [],
      recolorReplace: kit.recolorToReplace ?? [],
      nonSelectable: kit.nonSelectable,
    }));
}

export type ModelPart = { bodyPartId: number; name: string; kitId: number };

// modelId -> the identikit body part it belongs to, so the appearance editor can label each
// sub-model of a citizen ("Torso", "Legs"...) instead of showing a bare number. Built once:
// kits are static for the process lifetime. Models from NPC/item definitions that aren't
// part of any kit simply have no entry.
let modelIndexPromise: Promise<Record<number, ModelPart>> | null = null;

export function getModelPartIndex(): Promise<Record<number, ModelPart>> {
  if (!modelIndexPromise) {
    modelIndexPromise = loadAllKits().then((all) => {
      const index: Record<number, ModelPart> = {};
      for (const kit of usableKits(all)) {
        const name = BODY_PART_NAMES[kit.bodyPartId] ?? `Group ${kit.bodyPartId}`;
        for (const modelId of kit.models) {
          // First kit wins; later kits reusing a model don't change what part it is.
          if (!(modelId in index)) index[modelId] = { bodyPartId: kit.bodyPartId, name, kitId: kit.id };
        }
      }
      return index;
    });
  }
  return modelIndexPromise;
}
