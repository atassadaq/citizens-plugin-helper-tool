import type {
  CitizenInfo,
  CitizenRegionFile,
  EntityDetail,
  EntityKind,
  EntityPage,
  KitSummary,
  NearbyEntities,
  NearbyNpc,
  RegionSummary,
  RenderRequest,
  ScriptFile,
  ScriptSummary,
  SceneryInfo,
  StatusResponse,
} from "@citizens-helper/shared/src/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => json<T>(r));
}

export const api = {
  status: () => fetch("/api/status").then((r) => json<StatusResponse>(r)),

  listRegions: () => fetch("/api/regions").then((r) => json<RegionSummary[]>(r)),

  getRegion: (regionId: number) => fetch(`/api/regions/${regionId}`).then((r) => json<CitizenRegionFile>(r)),

  getNearby: (regionId: number, radius = 5) =>
    fetch(`/api/regions/${regionId}/nearby?radius=${radius}`).then((r) => json<NearbyEntities>(r)),

  getNearbyNpcs: (regionId: number, radius = 2) =>
    fetch(`/api/regions/${regionId}/npcs?radius=${radius}`).then((r) => json<NearbyNpc[]>(r)),

  saveCitizen: (regionId: number, uuid: string, citizen: CitizenInfo) =>
    post<CitizenRegionFile>(`/api/regions/${regionId}/citizens/${uuid}`, citizen),

  createCitizen: (regionId: number, citizen: CitizenInfo) =>
    post<CitizenRegionFile>(`/api/regions/${regionId}/citizens`, citizen),

  duplicateCitizen: (regionId: number, uuid: string) =>
    post<CitizenRegionFile>(`/api/regions/${regionId}/citizens/${uuid}/duplicate`, {}),

  deleteCitizen: (regionId: number, uuid: string) =>
    fetch(`/api/regions/${regionId}/citizens/${uuid}`, { method: "DELETE" }).then((r) =>
      json<CitizenRegionFile>(r),
    ),

  saveScenery: (regionId: number, uuid: string, scenery: SceneryInfo) =>
    post<CitizenRegionFile>(`/api/regions/${regionId}/scenery/${uuid}`, scenery),

  createScenery: (regionId: number, scenery: SceneryInfo) =>
    post<CitizenRegionFile>(`/api/regions/${regionId}/scenery`, scenery),

  deleteScenery: (regionId: number, uuid: string) =>
    fetch(`/api/regions/${regionId}/scenery/${uuid}`, { method: "DELETE" }).then((r) =>
      json<CitizenRegionFile>(r),
    ),

  searchEntities: (kind: EntityKind, params: { query?: string; offset?: number; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.query) search.set("query", params.query);
    if (params.offset != null) search.set("offset", String(params.offset));
    if (params.limit != null) search.set("limit", String(params.limit));
    return fetch(`/api/entities/${kind}?${search}`).then((r) => json<EntityPage>(r));
  },

  getEntity: (kind: EntityKind, id: number) =>
    fetch(`/api/entities/${kind}/${id}`).then((r) => json<EntityDetail>(r)),

  listScripts: () => fetch("/api/scripts").then((r) => json<ScriptSummary[]>(r)),

  getScript: (name: string) => fetch(`/api/scripts/${name}`).then((r) => json<ScriptFile>(r)),

  saveScript: (name: string, script: ScriptFile) =>
    fetch(`/api/scripts/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(script),
    }).then((r) => json<ScriptFile>(r)),

  deleteScript: (name: string) =>
    fetch(`/api/scripts/${name}`, { method: "DELETE" }).then((r) => json<{ deleted: string }>(r)),

  kitBodyParts: () => fetch("/api/kits/bodyParts").then((r) => json<{ bodyPartId: number; name: string }[]>(r)),

  kitsByBodyPart: (bodyPartId: number) => fetch(`/api/kits/${bodyPartId}`).then((r) => json<KitSummary[]>(r)),

  render: (req: RenderRequest) =>
    fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => {
      if (!r.ok) {
        return r.json().then((body) => {
          throw new Error(body.error ?? `Render failed: ${r.status}`);
        });
      }
      return r.text();
    }),
};
