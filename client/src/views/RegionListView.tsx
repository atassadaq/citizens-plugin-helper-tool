import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { RegionSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { RegionMap } from "../components/RegionMap";

type Props = {
  onSelectRegion: (regionId: number) => void;
  onOpenModelBrowser: () => void;
};

const hudPanelStyle: CSSProperties = {
  background: "rgba(24,26,32,0.85)",
  color: "#eee",
  borderRadius: 8,
  padding: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
};

export function RegionListView({ onSelectRegion, onOpenModelBrowser }: Props) {
  const [regions, setRegions] = useState<RegionSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [showPlaceNames, setShowPlaceNames] = useState(false);
  const [plane, setPlane] = useState(0);

  useEffect(() => {
    api
      .listRegions()
      .then(setRegions)
      .catch((e) => setError(e.message));
  }, []);

  // Memoized so the array reference only changes when regions/filter actually change -
  // RegionMap re-fits/rebuilds whenever its `regions` prop reference changes, and this is
  // otherwise recomputed (as a new array) on every render, including HUD-only state changes
  // like toggling the floor or place names, which would reset the user's pan/zoom.
  const filtered = useMemo(
    () => (regions ?? []).filter((r) => r.regionId.toString().includes(filter.trim())),
    [regions, filter],
  );

  if (error) return <p style={{ color: "crimson", padding: 16 }}>{error}</p>;
  if (!regions) return <p style={{ padding: 16 }}>Loading regions...</p>;

  const modeToggle = (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => setMode("map")} disabled={mode === "map"}>
        Map
      </button>
      <button onClick={() => setMode("list")} disabled={mode === "list"}>
        List
      </button>
      {mode === "map" && (
        <button onClick={() => setShowAllRegions((v) => !v)} style={{ fontWeight: showAllRegions ? "bold" : "normal" }}>
          {showAllRegions ? "Hide all regions" : "Show all regions"}
        </button>
      )}
      {mode === "map" && (
        <button onClick={() => setShowPlaceNames((v) => !v)} style={{ fontWeight: showPlaceNames ? "bold" : "normal" }}>
          {showPlaceNames ? "Hide place names" : "Show place names"}
        </button>
      )}
    </div>
  );

  const PLANE_NAMES = ["Ground floor", "1st floor", "2nd floor", "3rd floor"];
  const planeControl = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
      <button onClick={() => setPlane((p) => Math.max(0, p - 1))} disabled={plane === 0} title="Floor down">
        Z-
      </button>
      <span style={{ fontSize: 12, minWidth: 90, textAlign: "center" }}>{PLANE_NAMES[plane]}</span>
      <button onClick={() => setPlane((p) => Math.min(3, p + 1))} disabled={plane === 3} title="Floor up">
        Z+
      </button>
    </div>
  );

  if (mode === "list") {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>Citizens Plugin Helper Tool</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          {modeToggle}
          <button onClick={onOpenModelBrowser}>Model Browser</button>
          <input
            placeholder="Filter by region id..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginLeft: "auto", padding: 6, flex: 1, maxWidth: 320 }}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>Region ID</th>
              <th>Citizens</th>
              <th>Scenery</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.regionId}
                onClick={() => onSelectRegion(r.regionId)}
                style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
              >
                <td>{r.regionId}</td>
                <td>{r.citizenCount}</td>
                <td>{r.sceneryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Map mode: the map fills the whole viewport, and all controls float over it as HUD panels.
  return (
    <div style={{ position: "fixed", inset: 0, fontFamily: "sans-serif" }}>
      <RegionMap
        regions={filtered}
        onSelectRegion={onSelectRegion}
        showAllRegions={showAllRegions}
        showPlaceNames={showPlaceNames}
        plane={plane}
      />

      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, ...hudPanelStyle }}>
        <div style={{ fontSize: 15, fontWeight: "bold", marginBottom: 8 }}>Citizens Plugin Helper Tool</div>
        {modeToggle}
        <button onClick={onOpenModelBrowser} style={{ marginTop: 6 }}>
          Model Browser
        </button>
        {planeControl}
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, ...hudPanelStyle }}>
        <input
          placeholder="Filter by region id..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: 6, width: 220 }}
        />
      </div>

      <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 1000, fontSize: 12, ...hudPanelStyle }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 12, height: 12, background: "#4a90e2", display: "inline-block", borderRadius: 2 }} />
          Has citizens
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: showAllRegions ? 4 : 0 }}>
          <span style={{ width: 12, height: 12, background: "#5cb85c", display: "inline-block", borderRadius: 2 }} />
          Has scenery only
        </div>
        {showAllRegions && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ width: 12, height: 12, border: "1px solid rgba(190,190,190,0.8)", display: "inline-block", borderRadius: 2 }}
            />
            All region boundaries
          </div>
        )}
      </div>
    </div>
  );
}
