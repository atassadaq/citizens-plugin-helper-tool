import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { LiveViewer } from "../three/LiveViewer";

// The minimal shape EntityPreviewGrid needs to render a card and preview it live. Both
// EntityBrowserView's catalog rows and FavoritesView's FavoriteEntry rows satisfy this
// structurally, without either needing to depend on the other's type.
export type PreviewItem = {
  key: string;
  name: string | null;
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
};

type Props<T extends PreviewItem> = {
  items: T[];
  // The card's own contents (thumbnail, caption, favorite star, etc). The wrapping div's
  // onClick (selection) is handled by this component - renderCard should not itself
  // attach a click handler that would fight with it.
  renderCard: (item: T, selected: boolean) => ReactNode;
  // Label + handler for the panel's navigation action, e.g. "Open full details ->". Omit
  // to hide the action entirely.
  openAction?: { label: string; onOpen: (item: T) => void };
};

// Shared click-to-select, sticky-live-preview-panel UI. Only one LiveViewer canvas is
// ever mounted (the panel's) regardless of how many cards are in the grid, keeping the
// existing thumbnail-grid-vs-live-viewer WebGL-context-limit design intact (see this
// repo's CLAUDE.md - up to ~40 cards would exceed the browser's WebGL context limit if
// each got its own live canvas).
export function EntityPreviewGrid<T extends PreviewItem>({ items, renderCard, openAction }: Props<T>) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = items.find((i) => i.key === selectedKey) ?? null;

  const [gltf, setGltf] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected || selected.modelIds.length === 0) {
      setGltf(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setGltf(null);
    setPreviewError(null);
    api
      .render({
        modelIds: selected.modelIds,
        recolorFind: selected.recolorFind,
        recolorReplace: selected.recolorReplace,
      })
      .then((text) => {
        if (!cancelled) setGltf(text);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key]);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, flex: 1 }}>
        {items.map((item) => (
          <div key={item.key} onClick={() => setSelectedKey(item.key)} style={{ cursor: "pointer" }}>
            {renderCard(item, item.key === selectedKey)}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "sticky",
          top: 12,
          width: 260,
          flexShrink: 0,
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: 10,
        }}
      >
        {!selected && <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Click a card to preview it here.</p>}
        {selected && (
          <>
            <div style={{ width: 240, height: 240, background: "#1e1e22", borderRadius: 4, overflow: "hidden" }}>
              {gltf ? (
                <LiveViewer gltfText={gltf} width={240} height={240} />
              ) : (
                <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12, color: "#aaa" }}>
                  {selected.modelIds.length === 0 ? "No models" : "Loading preview..."}
                </div>
              )}
            </div>
            {previewError && <p style={{ color: "crimson", fontSize: 11 }}>{previewError}</p>}
            <div style={{ fontSize: 13, marginTop: 8, fontWeight: "bold" }}>
              {selected.name ?? <span style={{ opacity: 0.6 }}>(unnamed)</span>}
            </div>
            {openAction && (
              <button onClick={() => openAction.onOpen(selected)} style={{ fontSize: 12, marginTop: 8 }}>
                {openAction.label}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
