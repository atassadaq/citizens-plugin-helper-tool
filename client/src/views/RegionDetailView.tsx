import { useCallback, useEffect, useMemo, useState } from "react";
import type { CitizenInfo, CitizenRegionFile, SceneryInfo, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { RegionOverview } from "../components/RegionOverview";
import { NearbyNpcRoster } from "../components/NearbyNpcRoster";
import { regionName } from "../data/regionNames";
import { Icon } from "../ui/Icon";
import { PageLoading } from "../ui/AppShell";
import { useToast } from "../ui/Toasts";
import { useElementHeight } from "../ui/hooks";

type Props = {
  regionId: number;
  onBack: () => void;
  onSelectCitizen: (uuid: string) => void;
  onCreateCitizen: () => void;
  // Editing something that lives in a neighbouring region's file needs both ids, since the
  // map shows entities from a whole block of regions.
  onSelectCitizenIn: (regionId: number, uuid: string) => void;
  onSelectSceneryIn: (regionId: number, uuid: string) => void;
  // Opens the citizen creator pre-filled from that game NPC's appearance.
  onCloneNpcToCitizen: (npcId: number) => void;
  onCreateCitizenAt: (point: WorldPoint) => void;
  onCreateSceneryAt: (point: WorldPoint) => void;
};

const NEARBY_RADIUS = 2;

type Filter = "all" | "StationaryCitizen" | "WanderingCitizen" | "ScriptedCitizen" | "Scenery";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "StationaryCitizen", label: "Stationary" },
  { key: "WanderingCitizen", label: "Wandering" },
  { key: "ScriptedCitizen", label: "Scripted" },
  { key: "Scenery", label: "Scenery" },
];

const TYPE_BADGE: Record<string, string> = {
  StationaryCitizen: "badge-stationary",
  WanderingCitizen: "badge-wandering",
  ScriptedCitizen: "badge-scripted",
  Scenery: "badge-scenery",
};

type Row =
  | { kind: "citizen"; entity: CitizenInfo; label: string; type: string }
  | { kind: "scenery"; entity: SceneryInfo; label: string; type: string };

/**
 * The workspace for one 64x64 map chunk: a searchable roster of everything in it on the
 * left, and the tile map (with neighbouring regions faded in for context) on the right.
 * Right-clicking the map is the fastest way to add a citizen exactly where it should stand.
 */
export function RegionDetailView({
  regionId,
  onSelectCitizen,
  onCreateCitizen,
  onSelectCitizenIn,
  onSelectSceneryIn,
  onCloneNpcToCitizen,
  onCreateCitizenAt,
  onCreateSceneryAt,
}: Props) {
  const toast = useToast();
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plane, setPlane] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showNpcs, setShowNpcs] = useState(false);
  // Bumped after a mutation so the map re-fetches its markers too.
  const [mapVersion, setMapVersion] = useState(0);
  const [mapRef, mapHeight] = useElementHeight<HTMLDivElement>(600);

  // Stable identities: RegionOverview memoizes its markers on these, and a fresh closure
  // every render would rebuild every marker (and its thumbnail lookup) each time.
  const selectCitizen = useCallback((rid: number, uuid: string) => onSelectCitizenIn(rid, uuid), [onSelectCitizenIn]);
  const selectScenery = useCallback((rid: number, uuid: string) => onSelectSceneryIn(rid, uuid), [onSelectSceneryIn]);

  useEffect(() => {
    setRegion(null);
    setError(null);
    api
      .getRegion(regionId)
      .then(setRegion)
      .catch((e) => setError(e.message));
  }, [regionId]);

  // Every mutation returns the whole updated region file, so the roster is replaced with
  // the server's copy rather than patched locally - no chance of the two drifting.
  async function mutate(work: () => Promise<CitizenRegionFile>, success: string) {
    setBusy(true);
    try {
      setRegion(await work());
      setMapVersion((v) => v + 1);
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo<Row[]>(() => {
    if (!region) return [];
    const all: Row[] = [
      ...region.citizenRoster.map<Row>((c) => ({ kind: "citizen", entity: c, label: c.name, type: c.entityType })),
      ...region.sceneryRoster.map<Row>((s) => ({
        kind: "scenery",
        entity: s,
        label: `Scenery ${s.modelIds.slice(0, 2).join(", ")}${s.modelIds.length > 2 ? "…" : ""}`,
        type: "Scenery",
      })),
    ];
    const q = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (filter === "all" || r.type === filter) &&
        (!q ||
          r.label.toLowerCase().includes(q) ||
          (r.kind === "citizen" && (r.entity.startScript ?? "").toLowerCase().includes(q)) ||
          r.entity.modelIds.some((m) => String(m).startsWith(q))),
    );
  }, [region, query, filter]);

  if (error && !region) {
    return (
      <div className="page" style={{ height: "100%" }}>
        <div className="callout callout-danger">{error}</div>
      </div>
    );
  }
  if (!region) return <PageLoading label={`Loading region ${regionId}…`} />;

  const counts: Record<Filter, number> = {
    all: region.citizenRoster.length + region.sceneryRoster.length,
    StationaryCitizen: region.citizenRoster.filter((c) => c.entityType === "StationaryCitizen").length,
    WanderingCitizen: region.citizenRoster.filter((c) => c.entityType === "WanderingCitizen").length,
    ScriptedCitizen: region.citizenRoster.filter((c) => c.entityType === "ScriptedCitizen").length,
    Scenery: region.sceneryRoster.length,
  };
  const isEmpty = counts.all === 0;
  const place = regionName(regionId);

  function remove(row: Row) {
    const what = row.kind === "citizen" ? `"${row.label}"` : "this scenery";
    if (!confirm(`Delete ${what}? This rewrites RegionData/${regionId}.json.`)) return;
    if (row.kind === "citizen") {
      void mutate(() => api.deleteCitizen(regionId, row.entity.uuid), `Deleted ${row.label}`);
    } else {
      void mutate(() => api.deleteScenery(regionId, row.entity.uuid), "Deleted scenery");
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "340px 1fr" }}>
      {/* Roster */}
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ padding: "14px 14px 10px" }} className="stack-sm">
          <div>
            <h2 style={{ margin: 0 }}>{place ?? `Region ${regionId}`}</h2>
            <div className="xsmall faint mono">
              region {regionId}
              {isEmpty ? " · no data file yet" : ` · ${counts.all} entities`}
            </div>
          </div>
          <div className="row">
            <button className="btn-primary" onClick={onCreateCitizen} disabled={busy} style={{ flex: 1 }}>
              <Icon name="plus" /> New citizen
            </button>
            <button onClick={() => setShowNpcs((v) => !v)} className={showNpcs ? "is-active" : ""} title="Clone a real NPC from this area">
              <Icon name="copy" /> From NPC
            </button>
          </div>
          <input placeholder="Search name, script or model id…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="row-tight" style={{ flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`btn-sm${filter === f.key ? " is-active" : ""}`}
                onClick={() => setFilter(f.key)}
                disabled={f.key !== "all" && counts[f.key] === 0}
              >
                {f.label} <span className="faint">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px", minHeight: 0 }}>
          {showNpcs && (
            <div className="card card-pad" style={{ margin: "0 6px 10px" }}>
              <NearbyNpcRoster
                regionId={regionId}
                radius={NEARBY_RADIUS}
                onCloneToCitizen={(npc) => onCloneNpcToCitizen(npc.npcId)}
              />
            </div>
          )}

          {isEmpty ? (
            <div className="empty">
              <strong>An empty chunk</strong>
              <span>
                Right-click any tile on the map to place the first citizen or piece of scenery. Saving creates{" "}
                <code>RegionData/{regionId}.json</code>.
              </span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">Nothing matches that search.</div>
          ) : (
            rows.map((row) => (
              <div
                key={row.entity.uuid}
                className="list-item"
                role="button"
                tabIndex={0}
                onClick={() => (row.kind === "citizen" ? onSelectCitizen(row.entity.uuid) : onSelectSceneryIn(regionId, row.entity.uuid))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.currentTarget as HTMLElement).click();
                }}
              >
                <div className="thumb" style={{ width: 44, height: 44 }}>
                  <ModelThumb
                    modelIds={row.entity.modelIds}
                    recolorFind={row.entity.modelRecolorFind ?? []}
                    recolorReplace={row.entity.modelRecolorReplace ?? []}
                    size={44}
                    alt={row.label}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title truncate">{row.label}</div>
                  <div className="row-tight meta">
                    <span className={`badge ${TYPE_BADGE[row.type]}`}>{row.type.replace("Citizen", "")}</span>
                    <span className="mono">
                      {row.entity.worldLocation.x},{row.entity.worldLocation.y}
                      {row.entity.worldLocation.plane ? ` z${row.entity.worldLocation.plane}` : ""}
                    </span>
                  </div>
                </div>
                <div className="row-tight" onClick={(e) => e.stopPropagation()}>
                  {row.kind === "citizen" && (
                    <button
                      className="btn-ghost btn-sm btn-icon"
                      title="Duplicate"
                      disabled={busy}
                      onClick={() => mutate(() => api.duplicateCitizen(regionId, row.entity.uuid), `Duplicated ${row.label}`)}
                    >
                      <Icon name="copy" size={14} />
                    </button>
                  )}
                  <button className="btn-ghost btn-sm btn-icon" title="Delete" disabled={busy} onClick={() => remove(row)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Map */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, padding: 12, gap: 8 }}>
        <div className="row">
          <div className="segmented" title="Floor">
            {["Ground", "Floor 1", "Floor 2", "Floor 3"].map((p, i) => (
              <button key={i} className={plane === i ? "is-active" : ""} onClick={() => setPlane(i)}>
                {p}
              </button>
            ))}
          </div>
          <span className="xsmall faint">
            Click a marker to edit it · <strong>right-click a tile</strong> to add something there
          </span>
        </div>
        <div ref={mapRef} style={{ flex: 1, minHeight: 0 }}>
          <RegionOverview
            key={mapVersion}
            regionId={regionId}
            radius={NEARBY_RADIUS}
            plane={plane}
            onSelectCitizen={selectCitizen}
            onSelectScenery={selectScenery}
            onCreateCitizenAt={onCreateCitizenAt}
            onCreateSceneryAt={onCreateSceneryAt}
            height={Math.max(320, mapHeight - 28)}
          />
        </div>
      </div>
    </div>
  );
}
