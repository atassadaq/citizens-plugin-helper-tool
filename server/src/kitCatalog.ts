import { ConfigType, IndexType, type KitDefinition } from "osrscachereader";
import type { KitSummary } from "@citizens-helper/shared/src/types.js";
import { cache, cacheReady } from "./rsCache.js";

// RuneLite's net.runelite.api.kit.KitType enum (HEAD=0, CAPE=1, AMULET=2, WEAPON=3, TORSO=4,
// SHIELD=5, ARMS=6, LEGS=7, HAIR=8, HANDS=9, BOOTS=10, JAW=11) is an *equipment slot* index -
// verified empirically against the live cache that it does NOT match this identikit config's
// own bodyPartId numbering (e.g. bodyPartId 5 renders as trousers, not a shield; bodyPartId 6
// renders as boots, not arms). The live cache also has bodyPartId values 12 and 13, which
// KitType doesn't cover at all - the character-creation screen has grown since that enum was
// written. Rather than assert unverified names for slots we can't actually confirm, only the
// ones cross-checked against real citizen modelIds and/or an unambiguous rendered shape get a
// real name; the rest are labelled generically. Always trust the rendered thumbnail over the
// label - that's what the model browser UI is for.
const BODY_PART_NAMES: Record<number, string> = {
  0: "Head",
  4: "Torso",
  5: "Legs",
  6: "Boots",
  7: "Hair",
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
