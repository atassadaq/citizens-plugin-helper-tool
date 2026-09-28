// Audits which body parts each citizen's models cover. For every citizen, the triangles of
// all its models are rasterised into a front-view silhouette; each identikit body slot is
// then scored by how much of a standard kit's silhouette for that slot the citizen covers.
// Silhouettes (rather than vertex proximity) mean a robe correctly counts as covering the
// legs inside it. Usage: npx tsx scripts/auditBodyParts.ts > audit.json
import fs from "node:fs/promises";
import path from "node:path";
import { ConfigType, IndexType } from "osrscachereader";
import { cache, cacheReady } from "../src/rsCache.js";
import { config } from "../src/config.js";

const X0 = -96;
const Y0 = -300;
const W = 192;
const H = 330;

type Mesh = { x: number[]; y: number[]; z: number[]; a: number[]; b: number[]; c: number[] };

const meshCache = new Map<number, Mesh | null>();
async function mesh(id: number): Promise<Mesh | null> {
  if (meshCache.has(id)) return meshCache.get(id)!;
  let m: Mesh | null = null;
  try {
    const d: any = await cache.getDef(IndexType.MODELS, id);
    m = {
      x: [...d.vertexPositionsX],
      y: [...d.vertexPositionsY],
      z: [...d.vertexPositionsZ],
      a: [...d.faceVertexIndices1],
      b: [...d.faceVertexIndices2],
      c: [...d.faceVertexIndices3],
    };
  } catch {
    m = null;
  }
  meshCache.set(id, m);
  return m;
}

function raster(meshes: Mesh[], dilate = 0): Uint8Array {
  const mask = new Uint8Array(W * H);
  const put = (px: number, py: number) => {
    for (let dx = -dilate; dx <= dilate; dx++)
      for (let dy = -dilate; dy <= dilate; dy++) {
        const x = px + dx;
        const y = py + dy;
        if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = 1;
      }
  };
  for (const m of meshes) {
    for (let f = 0; f < m.a.length; f++) {
      const ax = m.x[m.a[f]] - X0, ay = m.y[m.a[f]] - Y0;
      const bx = m.x[m.b[f]] - X0, by = m.y[m.b[f]] - Y0;
      const cx = m.x[m.c[f]] - X0, cy = m.y[m.c[f]] - Y0;
      const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
      const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          if (area === 0) {
            put(x, y);
            continue;
          }
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
          const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05) put(x, y);
        }
    }
  }
  return mask;
}

function coverage(ref: Uint8Array, cit: Uint8Array): number {
  let total = 0, hit = 0;
  for (let i = 0; i < ref.length; i++)
    if (ref[i]) {
      total++;
      if (cit[i]) hit++;
    }
  return total ? hit / total : 0;
}

async function main() {
  await cacheReady;
  const kits: any[] = (await cache.getAllDefs(IndexType.CONFIGS, ConfigType.IDENTKIT)).filter((k: any) => k && k.models?.length);
  const kitModelSlot = new Map<number, number>();
  for (const k of kits) for (const m of k.models) if (!kitModelSlot.has(m)) kitModelSlot.set(m, k.bodyPartId);

  const refMasks: Record<number, Uint8Array> = {};
  const refKits: Record<number, number[]> = {};
  for (let slot = 0; slot <= 13; slot++) {
    const k = kits.find((kk) => kk.bodyPartId === slot && !kk.nonSelectable) ?? kits.find((kk) => kk.bodyPartId === slot);
    if (!k) continue;
    const ms = (await Promise.all(k.models.map((m: number) => mesh(m)))).filter(Boolean) as Mesh[];
    refMasks[slot] = raster(ms);
    refKits[slot] = k.models;
  }

  const files = (await fs.readdir(config.regionDataPath)).filter((f) => f.endsWith(".json"));
  const citizens: any[] = [];
  for (const file of files) {
    const region = JSON.parse(await fs.readFile(path.join(config.regionDataPath, file), "utf-8"));
    for (const c of region.citizenRoster ?? []) {
      const ms = (await Promise.all(c.modelIds.map((m: number) => mesh(m)))).filter(Boolean) as Mesh[];
      const mask = raster(ms, 2);
      let minY = Infinity, maxY = -Infinity;
      for (const m of ms) for (const y of m.y) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const cov: Record<number, number> = {};
      for (const s of Object.keys(refMasks).map(Number)) cov[s] = Math.round(coverage(refMasks[s], mask) * 100);
      const kitSlots = c.modelIds.map((m: number) => kitModelSlot.get(m) ?? null);
      citizens.push({ file, uuid: c.uuid, name: c.name, modelIds: c.modelIds, kitSlots, height: maxY - minY, cov });
    }
  }

  const kitsOut = kits.map((k) => ({
    id: k.id,
    slot: k.bodyPartId,
    models: k.models,
    nonSelectable: k.nonSelectable,
    find: k.recolorToFind ?? [],
    replace: k.recolorToReplace ?? [],
  }));
  console.log(JSON.stringify({ refKits, kits: kitsOut, citizens }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
