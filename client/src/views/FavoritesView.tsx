import { useState } from "react";
import type { FavoriteEntry, FavoriteKind } from "@citizens-helper/shared/src/types";
import { ModelThumb } from "../components/ModelThumb";
import { CopyButton } from "../components/CopyButton";
import { EntityPreviewGrid } from "../components/EntityPreviewGrid";
import { useFavorites } from "../favorites/FavoritesContext";

type Props = {
  onOpen: (entry: FavoriteEntry) => void;
};

const KIND_FILTERS: { kind: FavoriteKind | "all"; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "npc", label: "NPCs" },
  { kind: "object", label: "Objects" },
  { kind: "item", label: "Items" },
  { kind: "citizen", label: "Citizens" },
  { kind: "scenery", label: "Scenery" },
];

export function FavoritesView({ onOpen }: Props) {
  const { favorites, toggle, error } = useFavorites();
  const [kindFilter, setKindFilter] = useState<FavoriteKind | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = favorites
    .filter((f) => kindFilter === "all" || f.kind === kindFilter)
    .filter((f) => {
      if (!query) return true;
      const lowerQuery = query.toLowerCase();
      if ((f.name ?? f.sourceLabel ?? "").toLowerCase().includes(lowerQuery)) return true;
      return f.modelIds.join(",").includes(query);
    });

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Favorites</h2>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Snapshots of models/recolors/animations you've starred, across NPCs, objects, items, citizens and
        scenery. These do not update if the original source changes - remove and re-favorite to refresh one.
      </p>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {KIND_FILTERS.map((k) => (
          <button
            key={k.kind}
            onClick={() => setKindFilter(k.kind)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              background: k.kind === kindFilter ? "var(--accent-soft)" : "var(--surface-2)",
              color: k.kind === kindFilter ? "var(--accent)" : "inherit",
              fontWeight: k.kind === kindFilter ? "bold" : "normal",
            }}
          >
            {k.label}
          </button>
        ))}
        <input
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginLeft: "auto", padding: 6, width: 280 }}
        />
      </div>

      {filtered.length === 0 && <p>No favorites match.</p>}

      {filtered.length > 0 && (
        <EntityPreviewGrid
          items={filtered}
          openAction={{ label: "Open →", onOpen }}
          renderCard={(entry, selected) => (
            <div
              style={{
                border: selected ? "2px solid #4a90e2" : "1px solid var(--border)",
                borderRadius: 6,
                padding: 8,
                width: 140,
                background: "var(--surface)",
                textAlign: "center",
              }}
            >
              <ModelThumb
                modelIds={entry.modelIds}
                recolorFind={entry.recolorFind}
                recolorReplace={entry.recolorReplace}
                size={112}
                alt={entry.name ?? entry.key}
              />
              <div
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {entry.name ?? (
                  <span style={{ opacity: 0.7 }}>[{entry.modelIds.join(", ")}]</span>
                )}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                {entry.kind} &middot; {entry.sourceLabel}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <span onClick={(e) => e.stopPropagation()}>
                  <CopyButton text={entry.modelIds.join(",")} label="Copy ids" />
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(entry.key, () => entry);
                  }}
                  style={{ fontSize: 12, padding: "3px 8px", color: "var(--danger)" }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
