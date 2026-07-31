import { useEffect, useMemo, useState } from "react";
import type { NearbyNpc } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "./ModelThumb";

type Props = {
  regionId: number;
  radius: number;
  // Clones this NPC into a new citizen in this region.
  onCloneToCitizen: (npc: NearbyNpc) => void;
};

// The list runs to a few hundred entries for a busy area, so it's paged rather than dumped -
// each visible card renders a model thumbnail, and rendering 373 at once is what made the
// map version slow.
const PAGE_SIZE = 24;

export function NearbyNpcRoster({ regionId, radius, onCloneToCitizen }: Props) {
  const [npcs, setNpcs] = useState<NearbyNpc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    setNpcs(null);
    setError(null);
    api
      .getNearbyNpcs(regionId, radius)
      .then((list) => {
        if (!cancelled) setNpcs(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, radius]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return npcs ?? [];
    return (npcs ?? []).filter((n) => n.name.toLowerCase().includes(needle) || String(n.npcId) === needle);
  }, [npcs, query]);

  useEffect(() => setShown(PAGE_SIZE), [query, regionId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: "12px 0 6px" }}>Game NPCs nearby {npcs && `(${npcs.length})`}</h3>
        <input
          placeholder="Filter by name or id..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 5, width: 220 }}
        />
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
        Distinct NPCs found within {radius} region{radius === 1 ? "" : "s"} of here, most common first. Cloning copies
        the NPC's models and recolours into a new citizen.
      </p>

      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      {!npcs && !error && <p style={{ fontSize: 13 }}>Loading nearby NPCs...</p>}
      {npcs && filtered.length === 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>No matching NPCs.</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {filtered.slice(0, shown).map((npc) => (
          <div
            key={npc.npcId}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}
          >
            <ModelThumb
              modelIds={npc.modelIds}
              recolorFind={npc.recolorFind}
              recolorReplace={npc.recolorReplace}
              size={128}
              alt={npc.name}
            />
            <div style={{ fontSize: 13, marginTop: 6 }}>{npc.name}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              #{npc.npcId} &middot; {npc.spawnCount} spawn{npc.spawnCount === 1 ? "" : "s"}
            </div>
            <button
              onClick={() => onCloneToCitizen(npc)}
              style={{ fontSize: 11, padding: "3px 8px", marginTop: 6, cursor: "pointer" }}
            >
              Clone to citizen
            </button>
          </div>
        ))}
      </div>

      {filtered.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE_SIZE)} style={{ marginTop: 10, padding: "5px 12px" }}>
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </div>
  );
}
