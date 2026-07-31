import { ConfigType, IndexType } from "osrscachereader";
import type {
  EntityDetail,
  EntityKind,
  EntityPage,
  EntitySummary,
  ModelVariant,
} from "@citizens-helper/shared/src/types.js";
import { cache, cacheReady } from "./rsCache.js";

// Catalogs of every NPC/object/item in the game cache, browsed purely as a source of model
// ids to paste into a citizen. Same lazy-load-once-and-keep pattern as kitCatalog.ts: the
// underlying cache can't change while this process runs, so there's nothing to invalidate.
//
// Measured on the live cache (see patches/osrscachereader+1.1.3.patch for why these numbers
// took work to get): npc 16.3k defs / ~160ms, object 62.4k / ~325ms, item 34k / ~395ms,
// ~285MB resident with all three warm. Cheap enough to hold whole rather than page from disk.

// NOTE: without patches/osrscachereader+1.1.3.patch applied, every one of these catalogs
// comes back empty or throws - the stock 1.1.3 loaders don't know the int32 model opcodes
// the live cache now uses. `npm install` applies it via the postinstall patch-package hook.

const RAW_NULL_NAME = "null";

function normalizeName(name: string | undefined): string | null {
  if (!name || name === RAW_NULL_NAME) {
    return null;
  }
  return name;
}

// Item model fields are single ids with -1 meaning "absent", unlike npc/object model arrays.
function definedIds(...ids: (number | undefined)[]): number[] {
  return ids.filter((id): id is number => id != null && id >= 0);
}

type CatalogEntry = {
  summary: EntitySummary;
  detail: EntityDetail;
  // Precomputed once so search doesn't lowercase the same 60k names on every keystroke.
  searchName: string;
};

function npcEntry(def: NonNullable<Awaited<ReturnType<typeof loadNpcDefs>>[number]>): CatalogEntry {
  const name = normalizeName(def.name);
  const models = def.models ?? [];
  const variants: ModelVariant[] = [{ label: "Body", modelIds: models }];
  if (def.chatheadModels?.length) {
    variants.push({ label: "Chathead", modelIds: def.chatheadModels });
  }

  const summary: EntitySummary = {
    kind: "npc",
    id: def.id,
    name,
    modelIds: models,
    recolorFind: def.recolorToFind ?? [],
    recolorReplace: def.recolorToReplace ?? [],
  };

  return {
    summary,
    searchName: (name ?? "").toLowerCase(),
    detail: {
      ...summary,
      variants,
      truncatedAtOpcode: def.truncatedAtOpcode ?? null,
      standingAnimation: def.standingAnimation ?? null,
      walkingAnimation: def.walkingAnimation ?? null,
      size: def.size ?? null,
      combatLevel: def.combatLevel ?? null,
      // Sparse in the cache (a def can have action 3 but not 1), so holes are dropped.
      actions: (def.actions ?? []).filter((a): a is string => !!a),
    },
  };
}

function objectEntry(def: NonNullable<Awaited<ReturnType<typeof loadObjectDefs>>[number]>): CatalogEntry {
  const name = normalizeName(def.name);
  const models = def.objectModels ?? [];

  const summary: EntitySummary = {
    kind: "object",
    id: def.id,
    name,
    modelIds: models,
    recolorFind: def.recolorToFind ?? [],
    recolorReplace: def.recolorToReplace ?? [],
  };

  return {
    summary,
    searchName: (name ?? "").toLowerCase(),
    detail: {
      ...summary,
      variants: [{ label: "Models", modelIds: models }],
      truncatedAtOpcode: def.truncatedAtOpcode ?? null,
      objectTypes: def.objectTypes ?? null,
      sizeX: def.sizeX ?? null,
      sizeY: def.sizeY ?? null,
    },
  };
}

function itemEntry(def: NonNullable<Awaited<ReturnType<typeof loadItemDefs>>[number]>): CatalogEntry {
  const name = normalizeName(def.name);
  const wieldedMale = definedIds(def.maleModel0, def.maleModel1, def.maleModel2);
  const wieldedFemale = definedIds(def.femaleModel0, def.femaleModel1, def.femaleModel2);
  const inventory = definedIds(def.inventoryModel);

  const variants: ModelVariant[] = [];
  if (wieldedMale.length) variants.push({ label: "Worn (male)", modelIds: wieldedMale });
  if (wieldedFemale.length) variants.push({ label: "Worn (female)", modelIds: wieldedFemale });
  if (inventory.length) variants.push({ label: "Inventory icon", modelIds: inventory });

  // Prefer the worn model as the representative one: a citizen holding a watering can needs
  // the mesh the player character wields, not the flat inventory icon mesh.
  const primary = variants[0]?.modelIds ?? [];

  const summary: EntitySummary = {
    kind: "item",
    id: def.id,
    name,
    modelIds: primary,
    recolorFind: def.recolorToFind ?? [],
    recolorReplace: def.recolorToReplace ?? [],
  };

  return {
    summary,
    searchName: (name ?? "").toLowerCase(),
    detail: {
      ...summary,
      variants,
      truncatedAtOpcode: def.truncatedAtOpcode ?? null,
    },
  };
}

function loadNpcDefs() {
  return cacheReady.then(() => cache.getAllDefs(IndexType.CONFIGS, ConfigType.NPC));
}
function loadObjectDefs() {
  return cacheReady.then(() => cache.getAllDefs(IndexType.CONFIGS, ConfigType.OBJECT));
}
function loadItemDefs() {
  return cacheReady.then(() => cache.getAllDefs(IndexType.CONFIGS, ConfigType.ITEM));
}

async function buildCatalog(kind: EntityKind): Promise<CatalogEntry[]> {
  if (kind === "npc") {
    return (await loadNpcDefs()).filter((d) => d != null).map(npcEntry);
  }
  if (kind === "object") {
    return (await loadObjectDefs()).filter((d) => d != null).map(objectEntry);
  }
  return (await loadItemDefs()).filter((d) => d != null).map(itemEntry);
}

// One in-flight promise per kind, so concurrent first requests share a single parse
// instead of each paying it. Never evicted - see the note at the top of this file.
const catalogs = new Map<EntityKind, Promise<CatalogEntry[]>>();

function getCatalog(kind: EntityKind): Promise<CatalogEntry[]> {
  let existing = catalogs.get(kind);
  if (!existing) {
    existing = buildCatalog(kind);
    catalogs.set(kind, existing);
  }
  return existing;
}

// Index by id rather than trusting array position: catalogs are filtered (null slots
// dropped), so position and id diverge.
const byId = new Map<EntityKind, Promise<Map<number, CatalogEntry>>>();

function getById(kind: EntityKind): Promise<Map<number, CatalogEntry>> {
  let existing = byId.get(kind);
  if (!existing) {
    existing = getCatalog(kind).then((entries) => new Map(entries.map((e) => [e.summary.id, e])));
    byId.set(kind, existing);
  }
  return existing;
}

export type SearchOptions = {
  query?: string;
  offset?: number;
  limit?: number;
  // The browser exists to find models, so entries with none are hidden by default.
  includeModelless?: boolean;
};

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

export async function searchEntities(kind: EntityKind, options: SearchOptions = {}): Promise<EntityPage> {
  const entries = await getCatalog(kind);
  const rawQuery = (options.query ?? "").trim();
  const query = rawQuery.toLowerCase();

  // A purely numeric query is treated as an id lookup, since that's the only way to reach
  // the many thousands of unnamed-but-real cache entries.
  const queryAsId = /^\d+$/.test(rawQuery) ? Number(rawQuery) : null;

  const matched = entries.filter((entry) => {
    if (!options.includeModelless && entry.summary.modelIds.length === 0) {
      return false;
    }
    if (!query) {
      return true;
    }
    if (queryAsId != null && entry.summary.id === queryAsId) {
      return true;
    }
    return entry.searchName.includes(query);
  });

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT));

  return {
    kind,
    total: matched.length,
    offset,
    limit,
    items: matched.slice(offset, offset + limit).map((e) => e.summary),
  };
}

export async function getEntity(kind: EntityKind, id: number): Promise<EntityDetail | null> {
  const index = await getById(kind);
  return index.get(id)?.detail ?? null;
}

export const ENTITY_KINDS: EntityKind[] = ["npc", "object", "item"];

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as string[]).includes(value);
}
