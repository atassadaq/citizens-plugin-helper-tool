import { useEffect, useMemo, useState } from "react";
import type { RegionSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { RegionMap } from "../components/RegionMap";
import { OSRS_LOCATIONS } from "../data/osrsLocations";
import { regionName } from "../data/regionNames";
import { Icon } from "../ui/Icon";
import { PageLoading } from "../ui/AppShell";

// Shared between the map and the table: one fetch per mount is cheap (a directory listing),
// and keeping the two views independent means either can be deep-linked.
function useRegions() {
  const [regions, setRegions] = useState<RegionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listRegions()
      .then(setRegions)
      .catch((e) => setError(e.message));
  }, []);
  return { regions, error };
}

const PLANE_NAMES = ["Ground floor", "1st floor", "2nd floor", "3rd floor"];

type SearchHit = { regionId: number; label: string; detail: string };

/**
 * Finds regions by id or by place name. Place names resolve to the region containing the
 * place, so typing "draynor" jumps straight to the chunk you want to populate - even if it
 * has no data file yet.
 */
function searchRegions(query: string, regions: RegionSummary[]): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<number>();
  const byId = new Map(regions.map((r) => [r.regionId, r]));

  if (/^\d+$/.test(q)) {
    for (const r of regions) {
      if (r.regionId.toString().startsWith(q) && !seen.has(r.regionId)) {
        seen.add(r.regionId);
        hits.push({ regionId: r.regionId, label: regionName(r.regionId) ?? `Region ${r.regionId}`, detail: `${r.regionId} · ${r.citizenCount} citizens` });
      }
    }
    const exact = Number(q);
    if (exact > 0 && exact < 65536 && !seen.has(exact)) {
      hits.unshift({ regionId: exact, label: regionName(exact) ?? `Region ${exact}`, detail: `${exact} · empty` });
    }
  } else {
    for (const loc of OSRS_LOCATIONS) {
      if (!loc.name.toLowerCase().includes(q)) continue;
      const regionId = ((loc.x >> 6) << 8) | (loc.y >> 6);
      if (seen.has(regionId)) continue;
      seen.add(regionId);
      const r = byId.get(regionId);
      hits.push({
        regionId,
        label: loc.name,
        detail: `${regionId} · ${r ? `${r.citizenCount} citizens, ${r.sceneryCount} scenery` : "empty"}`,
      });
    }
  }
  return hits.slice(0, 8);
}

function RegionSearch({ regions, onSelect }: { regions: RegionSummary[]; onSelect: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchRegions(query, regions), [query, regions]);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span className="faint" style={{ position: "absolute", left: 9, top: 8 }}>
          <Icon name="search" size={15} />
        </span>
        <input
          autoFocus
          placeholder="Find a place or region id…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter" && hits[active]) onSelect(hits[active].regionId);
            if (e.key === "Escape") setQuery("");
          }}
          style={{ width: 280, paddingLeft: 30 }}
        />
      </div>
      {hits.length > 0 && (
        <div className="card" style={{ position: "absolute", top: 36, left: 0, right: 0, padding: 4, boxShadow: "var(--shadow-lg)" }}>
          {hits.map((h, i) => (
            <div
              key={`${h.regionId}-${h.label}`}
              className={`list-item${i === active ? " selected" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onSelect(h.regionId)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="title truncate">{h.label}</div>
                <div className="meta">{h.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const hudStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 1000,
  padding: 10,
  background: "color-mix(in srgb, var(--surface) 90%, transparent)",
  backdropFilter: "blur(8px)",
  boxShadow: "var(--shadow-lg)",
};

export function WorldMapView({ onSelectRegion }: { onSelectRegion: (regionId: number) => void }) {
  const { regions, error } = useRegions();
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [showPlaceNames, setShowPlaceNames] = useState(true);
  const [plane, setPlane] = useState(0);

  if (error) return <div className="callout callout-danger" style={{ margin: 20 }}>{error}</div>;
  if (!regions) return <PageLoading label="Loading regions…" />;

  const citizens = regions.reduce((n, r) => n + r.citizenCount, 0);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <RegionMap
        regions={regions}
        onSelectRegion={onSelectRegion}
        showAllRegions={showAllRegions}
        showPlaceNames={showPlaceNames}
        plane={plane}
      />

      <div className="card" style={{ ...hudStyle, top: 12, left: 12 }}>
        <RegionSearch regions={regions} onSelect={onSelectRegion} />
        <div className="xsmall faint" style={{ marginTop: 8 }}>
          {regions.length} regions with data · {citizens} citizens. Click any chunk to open it.
        </div>
      </div>

      <div className="card row" style={{ ...hudStyle, top: 12, right: 12 }}>
        <div className="segmented" role="group" aria-label="Floor">
          {PLANE_NAMES.map((name, p) => (
            <button key={p} className={plane === p ? "is-active" : ""} onClick={() => setPlane(p)} title={name}>
              {p === 0 ? "Ground" : `Floor ${p}`}
            </button>
          ))}
        </div>
        <button className={showPlaceNames ? "is-active" : ""} onClick={() => setShowPlaceNames((v) => !v)}>
          Place names
        </button>
        <button className={showAllRegions ? "is-active" : ""} onClick={() => setShowAllRegions((v) => !v)}>
          Region grid
        </button>
      </div>

      <div className="card stack-sm xsmall" style={{ ...hudStyle, bottom: 12, left: 12 }}>
        <div className="row-tight">
          <span style={{ width: 12, height: 12, background: "#4a90e2", borderRadius: 2 }} /> Has citizens
        </div>
        <div className="row-tight">
          <span style={{ width: 12, height: 12, background: "#5cb85c", borderRadius: 2 }} /> Scenery only
        </div>
      </div>
    </div>
  );
}

type SortKey = "regionId" | "name" | "citizenCount" | "sceneryCount";

export function RegionTableView({ onSelectRegion }: { onSelectRegion: (regionId: number) => void }) {
  const { regions, error } = useRegions();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "citizenCount", desc: true });

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = (regions ?? [])
      .map((r) => ({ ...r, name: regionName(r.regionId) ?? "" }))
      .filter((r) => !q || r.regionId.toString().includes(q) || r.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.desc ? -cmp : cmp;
    });
    return list;
  }, [regions, filter, sort]);

  if (error) return <div className="callout callout-danger">{error}</div>;
  if (!regions) return <PageLoading label="Loading regions…" />;

  const header = (key: SortKey, label: string) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" && key !== "regionId" }))}
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      {label} {sort.key === key ? (sort.desc ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="page-narrow">
      <div className="page-header">
        <div>
          <h1>Regions</h1>
          <div className="sub">Every 64×64 map chunk that has a RegionData file.</div>
        </div>
        <div className="spacer" />
        <input
          placeholder="Filter by id or place…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 260 }}
        />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              {header("regionId", "Region")}
              {header("name", "Nearby place")}
              {header("citizenCount", "Citizens")}
              {header("sceneryCount", "Scenery")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.regionId} onClick={() => onSelectRegion(r.regionId)} style={{ cursor: "pointer" }}>
                <td className="mono">{r.regionId}</td>
                <td>{r.name || <span className="faint">—</span>}</td>
                <td>{r.citizenCount}</td>
                <td>{r.sceneryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty">
            <strong>No regions match “{filter}”</strong>
            Try a region id, or find an empty chunk on the world map to start a new one.
          </div>
        )}
      </div>
    </div>
  );
}
