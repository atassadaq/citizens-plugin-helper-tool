import { useEffect, useMemo, useState } from "react";
import type { CitizenInfo, EntityType } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { EntityPreviewGrid, type PreviewItem } from "../components/EntityPreviewGrid";
import { EntityTabs } from "../components/EntityTabs";
import { regionLabel, regionName } from "../data/regionNames";
import { PageLoading } from "../ui/AppShell";

type Props = {
  onOpen: (regionId: number, uuid: string) => void;
};

type Item = PreviewItem & { citizen: CitizenInfo; place: string };

type TypeFilter = "all" | EntityType;
type Sort = "name" | "region" | "type";

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "StationaryCitizen", label: "Stationary" },
  { id: "WanderingCitizen", label: "Wandering" },
  { id: "ScriptedCitizen", label: "Scripted" },
];

const TYPE_BADGE: Record<string, string> = {
  StationaryCitizen: "badge-stationary",
  WanderingCitizen: "badge-wandering",
  ScriptedCitizen: "badge-scripted",
};

/**
 * Every citizen we've created, across all regions, in one searchable gallery. Clicking a
 * card previews it live; "Open in editor" jumps to its region's citizen editor.
 */
export function CitizensBrowserView({ onOpen }: Props) {
  const [citizens, setCitizens] = useState<CitizenInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<Sort>("name");

  useEffect(() => {
    api
      .listCitizens()
      .then(setCitizens)
      .catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: citizens?.length ?? 0 };
    for (const x of citizens ?? []) c[x.entityType] = (c[x.entityType] ?? 0) + 1;
    return c;
  }, [citizens]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const list = (citizens ?? [])
      // Hand-written region files don't always carry every field the type promises (some
      // citizens have no remarks or examine text), so normalize before searching.
      .map((raw) => ({ ...raw, name: raw.name ?? "", examineText: raw.examineText ?? "", remarks: raw.remarks ?? [] }))
      .map((c) => ({
        key: `citizen:${c.regionId}:${c.uuid}`,
        name: c.name,
        modelIds: c.modelIds,
        recolorFind: c.modelRecolorFind ?? [],
        recolorReplace: c.modelRecolorReplace ?? [],
        citizen: c,
        place: regionName(c.regionId) ?? "",
      }))
      .filter((i) => type === "all" || i.citizen.entityType === type)
      .filter(
        (i) =>
          !q ||
          i.citizen.name.toLowerCase().includes(q) ||
          i.citizen.examineText.toLowerCase().includes(q) ||
          i.place.toLowerCase().includes(q) ||
          String(i.citizen.regionId).includes(q) ||
          (i.citizen.startScript ?? "").toLowerCase().includes(q) ||
          i.citizen.remarks.some((r) => r.toLowerCase().includes(q)),
      );
    list.sort((a, b) => {
      if (sort === "region") return a.place.localeCompare(b.place) || a.citizen.regionId - b.citizen.regionId || a.name!.localeCompare(b.name!);
      if (sort === "type") return a.citizen.entityType.localeCompare(b.citizen.entityType) || a.name!.localeCompare(b.name!);
      return a.name!.localeCompare(b.name!);
    });
    return list;
  }, [citizens, query, type, sort]);

  const regionCount = useMemo(() => new Set((citizens ?? []).map((c) => c.regionId)).size, [citizens]);

  return (
    <div className="stack">
      <div className="row">
        <EntityTabs active="citizens" />
        <div className="spacer" />
        <input
          autoFocus
          placeholder="Search name, place, script, remark…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      {error && <div className="callout callout-danger">{error}</div>}
      {!citizens && !error && <PageLoading label="Loading citizens…" />}

      {citizens && (
        <>
          <div className="row">
            <div className="segmented" role="group" aria-label="Behaviour">
              {TYPES.map((t) => (
                <button key={t.id} className={type === t.id ? "is-active" : ""} onClick={() => setType(t.id)}>
                  {t.label} <span className="faint">{counts[t.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <label className="row-tight xsmall muted">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="name">Name</option>
                <option value="region">Place</option>
                <option value="type">Behaviour</option>
              </select>
            </label>
            <div className="spacer" />
            <span className="xsmall faint">
              {items.length === citizens.length
                ? `${citizens.length} citizens in ${regionCount} regions`
                : `${items.length} of ${citizens.length} citizens`}{" "}
              · click one to preview it
            </span>
          </div>

          {items.length === 0 ? (
            <div className="card empty">
              <strong>{citizens.length === 0 ? "No citizens yet" : "No citizens match"}</strong>
              {citizens.length === 0
                ? "Open a region from the world map and right-click a tile to add the first one."
                : "Try a different search or behaviour filter."}
            </div>
          ) : (
            <EntityPreviewGrid
              items={items}
              openAction={{ label: "Open in editor →", onOpen: (i) => onOpen(i.citizen.regionId, i.citizen.uuid) }}
              renderCard={(item, selected) => (
                <div
                  className="entity-card"
                  style={{ width: 150, borderColor: selected ? "var(--accent)" : undefined }}
                  title={`${item.citizen.name} · ${regionLabel(item.citizen.regionId)}`}
                  onDoubleClick={() => onOpen(item.citizen.regionId, item.citizen.uuid)}
                >
                  <ModelThumb
                    modelIds={item.modelIds}
                    recolorFind={item.recolorFind}
                    recolorReplace={item.recolorReplace}
                    size={112}
                    alt={item.citizen.name}
                  />
                  <div className="name truncate">{item.citizen.name}</div>
                  <span className={`badge ${TYPE_BADGE[item.citizen.entityType] ?? ""}`}>
                    {item.citizen.entityType.replace("Citizen", "")}
                  </span>
                  <div className="xsmall faint truncate" style={{ maxWidth: "100%" }}>
                    {item.place || `Region ${item.citizen.regionId}`}
                  </div>
                </div>
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
