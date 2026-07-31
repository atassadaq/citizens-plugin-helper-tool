import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EntityKind, EntityPage } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";

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

export function EntityBrowserView({ kind, onSelect }: Props) {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<EntityPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced so typing doesn't fire a request per keystroke against a 62k-entry catalog.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(rawQuery);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Reset paging when switching tabs, otherwise page 40 of NPCs lands you deep into objects.
  useEffect(() => {
    setOffset(0);
    setRawQuery("");
    setQuery("");
  }, [kind]);

  useEffect(() => {
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
  }, [kind, query, offset]);

  const total = page?.total ?? 0;
  const shownTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {KINDS.map((k) => (
          <Link
            key={k.kind}
            to={`/entities/${k.kind}`}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              textDecoration: "none",
              color: "inherit",
              background: k.kind === kind ? "#4a90e2" : "#eee",
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
      </div>

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Every entity here is a source of model ids to paste into a citizen. Entities with no models are hidden.
        Open one to see the individual models it's built from.
      </p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!page && !error && <p>Loading...</p>}
      {page && total === 0 && <p>No matches.</p>}

      {page && total > 0 && (
        <>
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

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {page.items.map((entity) => (
              <button
                key={entity.id}
                onClick={() => onSelect(entity.id)}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  padding: 8,
                  width: 132,
                  background: "white",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                title={`${entity.name ?? "(unnamed)"} - id ${entity.id}`}
              >
                <ModelThumb
                  modelIds={entity.modelIds}
                  recolorFind={entity.recolorFind}
                  recolorReplace={entity.recolorReplace}
                  size={112}
                  alt={entity.name ?? String(entity.id)}
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
                  {entity.name ?? <span style={{ opacity: 0.5 }}>(unnamed)</span>}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  #{entity.id} &middot; {entity.modelIds.length} model{entity.modelIds.length === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
