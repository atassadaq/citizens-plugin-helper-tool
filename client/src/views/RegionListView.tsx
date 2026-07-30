import { useEffect, useState } from "react";
import type { RegionSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";

type Props = {
  onSelectRegion: (regionId: number) => void;
};

export function RegionListView({ onSelectRegion }: Props) {
  const [regions, setRegions] = useState<RegionSummary[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRegions()
      .then(setRegions)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!regions) return <p>Loading regions...</p>;

  const filtered = regions.filter((r) => r.regionId.toString().includes(filter.trim()));

  return (
    <div>
      <input
        placeholder="Filter by region id..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 12, padding: 6, width: "100%", boxSizing: "border-box" }}
      />
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
