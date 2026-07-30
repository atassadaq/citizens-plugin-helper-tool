import { useEffect, useState } from "react";
import type { CitizenInfo, CitizenRegionFile } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { renderThumbnail } from "../three/thumbnailRenderer";

type Props = {
  regionId: number;
  onBack: () => void;
  onSelectCitizen: (uuid: string) => void;
};

function CitizenCard({ citizen, onClick }: { citizen: CitizenInfo; onClick: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .render({
        modelIds: citizen.modelIds,
        recolorFind: citizen.modelRecolorFind ?? [],
        recolorReplace: citizen.modelRecolorReplace ?? [],
      })
      .then((gltf) => renderThumbnail(gltf))
      .then((dataUrl) => {
        if (!cancelled) setThumb(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [citizen.uuid]);

  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 8,
        width: 140,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 128,
          height: 128,
          background: "#f2f2f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        {thumb && <img src={thumb} width={128} height={128} alt={citizen.name} />}
        {!thumb && !failed && <span style={{ fontSize: 11, opacity: 0.5 }}>loading...</span>}
        {failed && <span style={{ fontSize: 11, color: "crimson" }}>render failed</span>}
      </div>
      <div style={{ fontSize: 13 }}>{citizen.name}</div>
    </div>
  );
}

export function RegionDetailView({ regionId, onBack, onSelectCitizen }: Props) {
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRegion(regionId)
      .then(setRegion)
      .catch((e) => setError(e.message));
  }, [regionId]);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!region) return <p>Loading region {regionId}...</p>;

  return (
    <div>
      <button onClick={onBack}>&larr; Back to regions</button>
      <h2>Region {regionId}</h2>

      <h3>Citizens ({region.citizenRoster.length})</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {region.citizenRoster.map((c) => (
          <CitizenCard key={c.uuid} citizen={c} onClick={() => onSelectCitizen(c.uuid)} />
        ))}
      </div>

      {region.sceneryRoster.length > 0 && (
        <>
          <h3>Scenery ({region.sceneryRoster.length})</h3>
          <ul>
            {region.sceneryRoster.map((s) => (
              <li key={s.uuid}>
                uuid: {s.uuid} - models: {s.modelIds.join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
