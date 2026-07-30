// osrscachereader ships no type declarations - minimal ambient types covering
// only what this project actually uses (traced from its source during prototyping).
declare module "osrscachereader" {
  export class ModelDefinition {
    recolor(find: number, replace: number): void;
  }

  export class RSCache {
    constructor(cacheRootDir: string, progressFunc?: (progress: number) => void);
    onload: Promise<void>;
    close(): void;
    getDef(indexType: unknown, id: number): Promise<ModelDefinition>;
  }

  export const IndexType: {
    MODELS: unknown;
    [key: string]: unknown;
  };

  export class ModelGroup {
    addModel(model: ModelDefinition): void;
    getMergedModel(): ModelDefinition;
  }

  export class GLTFExporter {
    constructor(model: ModelDefinition);
    addColors(model: ModelDefinition): void;
    export(): string;
  }
}
