import type {
  CitizenInfo,
  CitizenRegionFile,
  RegionSummary,
  RenderRequest,
  StatusResponse,
} from "@citizens-helper/shared/src/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => fetch("/api/status").then((r) => json<StatusResponse>(r)),

  listRegions: () => fetch("/api/regions").then((r) => json<RegionSummary[]>(r)),

  getRegion: (regionId: number) => fetch(`/api/regions/${regionId}`).then((r) => json<CitizenRegionFile>(r)),

  saveCitizen: (regionId: number, uuid: string, citizen: CitizenInfo) =>
    fetch(`/api/regions/${regionId}/citizens/${uuid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(citizen),
    }).then((r) => json<CitizenRegionFile>(r)),

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
