// osrscachereader ships no type declarations - minimal ambient types covering
// only what this project actually uses (traced from its source during prototyping).
declare module "osrscachereader" {
  export class ModelDefinition {
    recolor(find: number, replace: number): void;
  }

  // One identikit (character-creation body part) config entry. Field names/casing are
  // dictated by osrscachereader's KitLoader, not something we control.
  export class KitDefinition {
    id: number;
    bodyPartId: number;
    models: number[];
    recolorToFind: number[];
    recolorToReplace: number[];
    nonSelectable: boolean;
  }

  // `truncatedAtOpcode` is not upstream - it's added by patches/osrscachereader+1.1.3.patch,
  // which makes each loader stop cleanly at an opcode it doesn't recognize instead of
  // silently desyncing the rest of the record. Present only on defs that hit one.
  interface TruncatableDefinition {
    truncatedAtOpcode?: number;
  }

  export class NpcDefinition implements TruncatableDefinition {
    id: number;
    name?: string;
    models: number[];
    recolorToFind: number[];
    recolorToReplace: number[];
    chatheadModels: number[];
    standingAnimation: number;
    walkingAnimation: number;
    size: number;
    combatLevel: number;
    actions: (string | undefined)[];
    truncatedAtOpcode?: number;
  }

  export class ObjectDefinition implements TruncatableDefinition {
    id: number;
    name?: string;
    // Named `objectModels`, not `models` - ObjectLoader's own field naming.
    objectModels?: number[];
    // Null when the record used a models-only opcode (5/7) rather than a
    // model-plus-type opcode (1/6).
    objectTypes?: number[] | null;
    recolorToFind: number[];
    recolorToReplace: number[];
    sizeX: number;
    sizeY: number;
    truncatedAtOpcode?: number;
  }

  export class ItemDefinition implements TruncatableDefinition {
    id: number;
    name?: string;
    // Single id (the inventory icon mesh), not an array - and -1 when absent.
    inventoryModel: number;
    maleModel0: number;
    maleModel1: number;
    maleModel2: number;
    femaleModel0: number;
    femaleModel1: number;
    femaleModel2: number;
    recolorToFind?: number[];
    recolorToReplace?: number[];
    truncatedAtOpcode?: number;
  }

  // An animation. `frameIDs` pack the skeleton id in the high 16 bits and the frame index
  // in the low 16; `frameLengths` are per-frame durations in client ticks (20ms each).
  export class SequenceDefinition {
    id: number;
    name?: string;
    frameIDs: number[];
    frameLengths: number[];
    animMayaID?: number;
  }

  export class RSCache {
    constructor(cacheRootDir: string, progressFunc?: (progress: number) => void);
    onload: Promise<void>;
    close(): void;
    getDef(indexType: unknown, id: number): Promise<ModelDefinition>;
    // Raw index/archive/file addressing, needed for sequences: they live in the CONFIGS
    // index rather than having an index of their own. The wrapper is `{ def }`, and `def`
    // is null for an id with no entry.
    getFile(
      indexId: number,
      archiveId: number,
      fileId: number,
    ): Promise<{ def: SequenceDefinition | null }>;
    // Overloaded by archive type: each ConfigType maps to a different definition class.
    // Sparse - unused id slots come back as null, so callers must filter.
    getAllDefs(indexType: unknown, archiveType: typeof ConfigType.IDENTKIT): Promise<(KitDefinition | null)[]>;
    getAllDefs(indexType: unknown, archiveType: typeof ConfigType.NPC): Promise<(NpcDefinition | null)[]>;
    getAllDefs(indexType: unknown, archiveType: typeof ConfigType.OBJECT): Promise<(ObjectDefinition | null)[]>;
    getAllDefs(indexType: unknown, archiveType: typeof ConfigType.ITEM): Promise<(ItemDefinition | null)[]>;
  }

  export const IndexType: {
    MODELS: unknown;
    CONFIGS: { id: number };
    [key: string]: unknown;
  };

  // Branded per member so the getAllDefs overloads above can discriminate between them -
  // without this they'd all be the same `unknown` and the overload set would be ambiguous.
  export const ConfigType: {
    IDENTKIT: { readonly __config: "IDENTKIT" };
    NPC: { readonly __config: "NPC" };
    OBJECT: { readonly __config: "OBJECT" };
    ITEM: { readonly __config: "ITEM" };
    SEQUENCE: { readonly __config: "SEQUENCE"; id: number };
    [key: string]: unknown;
  };

  export class ModelGroup {
    addModel(model: ModelDefinition): void;
    getMergedModel(): ModelDefinition;
  }

  export class GLTFExporter {
    constructor(model: ModelDefinition);
    addColors(model: ModelDefinition): void;
    // Bakes each frame of the sequence as a GLTF morph target and emits one animation
    // track driving the mesh weights. Throws if the model has no vertex skins to pose.
    addSequence(cache: RSCache, sequence: SequenceDefinition): Promise<void>;
    export(): string;
  }
}
