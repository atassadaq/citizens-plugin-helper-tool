import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EntityKind, EntityPage, EntitySummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { EntityPreviewGrid, type PreviewItem } from "../components/EntityPreviewGrid";
import { useFavorites } from "../favorites/FavoritesContext";

type Props = {
  kind: EntityKind;
  onSelect: (id: number) => void;
};

const KINDS: { kind: EntityKind; label: string }[] = [
  { kind: "npc", label: "NPCs" },
  { kind: "object", label: "Objects" },
  { kind: "item", label: "Items" },
];

const PAGE_SIZE = 60;

// The shape both the paginated catalog results and the client-side favorites filter get
// normalized into before rendering, so EntityPreviewGrid/renderCard only deal with one type.
type BrowserItem = PreviewItem & { id: number };

function fromSummary(kind: EntityKind, entity: EntitySummary): BrowserItem {
  return {
    key: `${kind}:${entity.id}`,
    id: entity.id,
    name: entity.name,
    modelIds: entity.modelIds,
    recolorFind: entity.recolorFind,
    recolorReplace: entity.recolorReplace,
  };
}

export function EntityBrowserView({ kind, onSelect }: Props) {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<EntityPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites } = useFavorites();

  // Debounced so typing doesn't fire a request per keystroke against a 62k-entry catalog.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(rawQuery);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Reset paging when switching tabs, otherwise page 40 of NPCs lands you deep into objects.
  // Also clear the fetched page itself - otherwise cards from the previous kind can briefly
  // render under the new kind's label before the new fetch resolves, e.g. mislabeling an
  // NPC's favorite key as `object:<npcId>` if a star is clicked in that window.
  useEffect(() => {
    setOffset(0);
    setRawQuery("");
    setQuery("");
    setPage(null);
  }, [kind]);

  useEffect(() => {
    if (favoritesOnly) {
      // Favorites are already-fetched snapshots with everything the grid needs - no
      // reason to also hit the paginated catalog search.
      return;
    }
    let cancelled = false;
    setError(null);
    api
      .searchEntities(kind, { query, offset, limit: PAGE_SIZE })
      .then((p) => {
        if (!cancelled) setPage(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, query, offset, favoritesOnly]);

  const favoriteItems: BrowserItem[] = favorites
    .filter((f) => f.kind === kind)
    .filter((f) => !query || (f.name ?? "").toLowerCase().includes(query.toLowerCase()))
    .map((f) => ({
      key: f.key,
      id: Number(f.key.split(":")[1]),
      name: f.name,
      modelIds: f.modelIds,
      recolorFind: f.recolorFind,
      recolorReplace: f.recolorReplace,
    }));

  const catalogItems: BrowserItem[] = (page?.items ?? []).map((entity) => fromSummary(kind, entity));
  const items = favoritesOnly ? favoriteItems : catalogItems;
  const total = favoritesOnly ? favoriteItems.length : (page?.total ?? 0);
  const shownTo = favoritesOnly ? favoriteItems.length : Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {KINDS.map((k) => (
          <Link
            key={k.kind}
            to={`/entities/${k.kind}`}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              textDecoration: "none",
              color: "inherit",
              background: k.kind === kind ? "var(--accent-soft)" : "var(--surface-2)",
              fontWeight: k.kind === kind ? "bold" : "normal",
            }}
          >
            {k.label}
          </Link>
        ))}
        <input
          placeholder="Search by name or id..."
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          style={{ marginLeft: "auto", padding: 6, width: 280 }}
        />
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => {
              setFavoritesOnly(e.target.checked);
              setOffset(0);
            }}
          />
          ★ Favorites only
        </label>
      </div>

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Every entity here is a source of model ids to paste into a citizen. Entities with no models are hidden.
        Click one to preview it live in the panel on the right.
      </p>

      {error && !favoritesOnly && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!page && !favoritesOnly && !error && <p>Loading...</p>}
      {total === 0 && (page || favoritesOnly) && (
        <p>{favoritesOnly ? "No favorites for this kind yet." : "No matches."}</p>
      )}

      {total > 0 && (
        <>
          {!favoritesOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, fontSize: 13 }}>
              <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
                &larr; Prev
              </button>
              <span>
                {offset + 1}-{shownTo} of {total}
              </span>
              <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={shownTo >= total}>
                Next &rarr;
              </button>
            </div>
          )}

          <EntityPreviewGrid
            items={items}
            openAction={{ label: "Open full details →", onOpen: (item) => onSelect(item.id) }}
            renderCard={(item, selected) => (
              <div
                style={{
                  border: selected ? "2px solid #4a90e2" : "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 8,
                  width: 132,
                  background: "var(--surface)",
                  textAlign: "center",
                  position: "relative",
                }}
                title={`${item.name ?? "(unnamed)"} - id ${item.id}`}
              >
                <div style={{ position: "absolute", top: 2, right: 2 }}>
                  <FavoriteStar
                    entryKey={item.key}
                    buildEntry={() => ({
                      key: item.key,
                      kind,
                      sourceLabel: `${kind} #${item.id}`,
                      name: item.name,
                      modelIds: item.modelIds,
                      recolorFind: item.recolorFind,
                      recolorReplace: item.recolorReplace,
                      // Grid rows only carry EntitySummary fields (id/name/models/recolors) -
                      // standing/walking animation is only available on the full EntityDetail
                      // fetched by the detail page, so a favorite made from here has none.
                      // Open the entity and favorite it from there to capture animations too.
                      animations: {},
                    })}
                  />
                </div>
                <ModelThumb
                  modelIds={item.modelIds}
                  recolorFind={item.recolorFind}
                  recolorReplace={item.recolorReplace}
                  size={112}
                  alt={item.name ?? String(item.id)}
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
                  {item.name ?? <span style={{ opacity: 0.5 }}>(unnamed)</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  #{item.id} &middot; {item.modelIds.length} model{item.modelIds.length === 1 ? "" : "s"}
                </div>
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}
