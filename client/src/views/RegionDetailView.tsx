import { useCallback, useEffect, useState } from "react";
import type { CitizenInfo, CitizenRegionFile, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { RegionOverview } from "../components/RegionOverview";
import { NearbyNpcRoster } from "../components/NearbyNpcRoster";

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

function CitizenCard({
  citizen,
  onClick,
  onDuplicate,
  onDelete,
  busy,
}: {
  citizen: CitizenInfo;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
      <div onClick={onClick} style={{ cursor: "pointer" }}>
        <ModelThumb
          modelIds={citizen.modelIds}
          recolorFind={citizen.modelRecolorFind ?? []}
          recolorReplace={citizen.modelRecolorReplace ?? []}
          size={128}
          alt={citizen.name}
        />
        <div style={{ fontSize: 13, marginTop: 6 }}>{citizen.name}</div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>{citizen.entityType.replace("Citizen", "")}</div>
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
        <button onClick={onDuplicate} disabled={busy} style={{ fontSize: 11, padding: "2px 6px" }}>
          Duplicate
        </button>
        <button onClick={onDelete} disabled={busy} style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function RegionDetailView({
  regionId,
  onBack,
  onSelectCitizen,
  onCreateCitizen,
  onSelectCitizenIn,
  onSelectSceneryIn,
  onCloneNpcToCitizen,
  onCreateCitizenAt,
  onCreateSceneryAt,
}: Props) {
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Map first: clicking a region on the world map should land you looking at that region,
  // not at a list.
  const [view, setView] = useState<"map" | "roster">("map");
  const [plane, setPlane] = useState(0);

  // Stable identities: RegionOverview memoizes its markers on these, and a fresh closure
  // every render would rebuild every marker (and its thumbnail lookup) each time.
  const selectCitizen = useCallback(
    (rid: number, uuid: string) => onSelectCitizenIn(rid, uuid),
    [onSelectCitizenIn],
  );
  const selectScenery = useCallback(
    (rid: number, uuid: string) => onSelectSceneryIn(rid, uuid),
    [onSelectSceneryIn],
  );

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
  async function mutate(work: () => Promise<CitizenRegionFile>) {
    setBusy(true);
    setError(null);
    try {
      setRegion(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !region) {
    return (
      <div>
        <button onClick={onBack}>&larr; Back to regions</button>
        <p style={{ color: "crimson" }}>{error}</p>
      </div>
    );
  }
  if (!region) return <p>Loading region {regionId}...</p>;

  const isEmpty = region.citizenRoster.length === 0 && region.sceneryRoster.length === 0;

  return (
    <div>
      <button onClick={onBack}>&larr; Back to regions</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ marginBottom: 4 }}>Region {regionId}</h2>
        <button onClick={() => setView("map")} disabled={view === "map"}>
          Map
        </button>
        <button onClick={() => setView("roster")} disabled={view === "roster"}>
          Roster
        </button>
        <button onClick={onCreateCitizen} disabled={busy}>
          + New citizen
        </button>
        {view === "map" && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <button onClick={() => setPlane((p) => Math.max(0, p - 1))} disabled={plane === 0}>
              Z-
            </button>
            plane {plane}
            <button onClick={() => setPlane((p) => Math.min(3, p + 1))} disabled={plane === 3}>
              Z+
            </button>
          </span>
        )}
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {isEmpty && (
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          This region has no data file yet. Creating a citizen here will create{" "}
          <code>RegionData/{regionId}.json</code>.
        </p>
      )}

      {view === "map" && (
        <RegionOverview
          regionId={regionId}
          radius={NEARBY_RADIUS}
          plane={plane}
          onSelectCitizen={selectCitizen}
          onSelectScenery={selectScenery}
          onCreateCitizenAt={onCreateCitizenAt}
          onCreateSceneryAt={onCreateSceneryAt}
        />
      )}

      {view === "roster" && (
        <>
      <h3>Citizens ({region.citizenRoster.length})</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {region.citizenRoster.map((c) => (
          <CitizenCard
            key={c.uuid}
            citizen={c}
            busy={busy}
            onClick={() => onSelectCitizen(c.uuid)}
            onDuplicate={() => mutate(() => api.duplicateCitizen(regionId, c.uuid))}
            onDelete={() => {
              if (confirm(`Delete "${c.name}"? This rewrites RegionData/${regionId}.json.`)) {
                mutate(() => api.deleteCitizen(regionId, c.uuid));
              }
            }}
          />
        ))}
      </div>

      <h3>Scenery ({region.sceneryRoster.length})</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {region.sceneryRoster.map((s) => (
          <div key={s.uuid} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
            <ModelThumb
              modelIds={s.modelIds}
              recolorFind={s.modelRecolorFind ?? []}
              recolorReplace={s.modelRecolorReplace ?? []}
              size={128}
              alt={`scenery ${s.uuid}`}
            />
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>[{s.modelIds.join(", ")}]</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              ({s.worldLocation.x}, {s.worldLocation.y})
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
              <button
                onClick={() => onSelectSceneryIn(regionId, s.uuid)}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px" }}
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete this scenery entry? This rewrites RegionData/${regionId}.json.`)) {
                    mutate(() => api.deleteScenery(regionId, s.uuid));
                  }
                }}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

          <NearbyNpcRoster
            regionId={regionId}
            radius={NEARBY_RADIUS}
            onCloneToCitizen={(npc) => onCloneNpcToCitizen(npc.npcId)}
          />
        </>
      )}
    </div>
  );
}
