import { useEffect, useMemo, useRef, useState } from "react";
import type { CitizenInfo, NearbyEntities, SceneryInfo, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { RegionTileMap, type MapMarker } from "../components/RegionTileMap";
import { peekThumbnail, resolveThumbnails, thumbKey } from "../three/thumbnailCache";

type Props = {
  regionId: number;
  // Radius in regions of surrounding context to draw. 0 shows only this region.
  radius?: number;
  plane: number;
  onSelectCitizen: (regionId: number, uuid: string) => void;
  onSelectScenery: (regionId: number, uuid: string) => void;
  onCreateCitizenAt: (point: WorldPoint) => void;
  onCreateSceneryAt: (point: WorldPoint) => void;
  height?: number;
};

// Entity classes are colour-coded rather than shape-coded because they all render as a model
// thumbnail once loaded - the border colour is the only thing left to tell them apart.
const CITIZEN_COLOR = "#4a90e2";
const SCENERY_COLOR = "#5cb85c";

type ContextMenu = { point: WorldPoint; screen: { x: number; y: number } };

export function RegionOverview({
  regionId,
  radius = 5,
  plane,
  onSelectCitizen,
  onSelectScenery,
  onCreateCitizenAt,
  onCreateSceneryAt,
  height = 620,
}: Props) {
  const [nearby, setNearby] = useState<NearbyEntities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);

  // Thumbnails arrive over many seconds; keeping them in a keyed map (rather than rebuilding
  // the entity list) means one arriving re-renders markers without refetching anything.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setNearby(null);
    setError(null);
    api
      .getNearby(regionId, radius)
      .then((n) => {
        if (!cancelled) setNearby(n);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [regionId, radius]);

  // Entities in the region being viewed are what you're most likely to want to see, so they
  // are rendered first; the surrounding regions fill in afterwards.
  const entities = useMemo(() => {
    const citizens = nearby?.citizens ?? [];
    const scenery = nearby?.scenery ?? [];
    const byLocality = <T extends { regionId: number }>(list: T[]) =>
      [...list].sort((a, b) => Number(b.regionId === regionId) - Number(a.regionId === regionId));
    return { citizens: byLocality(citizens), scenery: byLocality(scenery) };
  }, [nearby, regionId]);

  useEffect(() => {
    const requests = [...entities.citizens, ...entities.scenery]
      .map((e) => ({
        modelIds: e.modelIds,
        recolorFind: e.modelRecolorFind ?? [],
        recolorReplace: e.modelRecolorReplace ?? [],
      }))
      .filter((e) => e.modelIds.length > 0)
      .map((e) => ({
        key: thumbKey(e.modelIds, e.recolorFind, e.recolorReplace),
        modelIds: e.modelIds,
        recolorFind: e.recolorFind,
        recolorReplace: e.recolorReplace,
      }))
      // Many citizens share an appearance (guards, monks), and the cache is keyed on the
      // render inputs, so asking once per distinct look avoids redundant round-trips.
      .filter((req, i, list) => list.findIndex((other) => other.key === req.key) === i)
      .filter((req) => !peekThumbnail(req.modelIds, req.recolorFind, req.recolorReplace));

    if (requests.length === 0) return;
    return resolveThumbnails(requests, (key, dataUrl) => {
      setThumbs((prev) => (prev[key] ? prev : { ...prev, [key]: dataUrl }));
    });
  }, [entities]);

  const markers = useMemo<MapMarker[]>(() => {
    const thumbFor = (e: CitizenInfo | SceneryInfo) => {
      const key = thumbKey(e.modelIds, e.modelRecolorFind ?? [], e.modelRecolorReplace ?? []);
      return thumbs[key] ?? peekThumbnail(e.modelIds, e.modelRecolorFind ?? [], e.modelRecolorReplace ?? []);
    };

    const citizenMarkers = entities.citizens
      .filter((c) => c.worldLocation.plane === plane)
      .map<MapMarker>((c) => ({
        id: `citizen:${c.uuid}`,
        point: c.worldLocation,
        label: c.name,
        color: CITIZEN_COLOR,
        faded: c.regionId !== regionId,
        thumbnail: thumbFor(c),
        hasModel: c.modelIds.length > 0,
        onClick: () => onSelectCitizen(c.regionId, c.uuid),
      }));

    const sceneryMarkers = entities.scenery
      .filter((s) => s.worldLocation.plane === plane)
      .map<MapMarker>((s) => ({
        id: `scenery:${s.uuid}`,
        // Scenery has no name field at all - the model ids are the only identifying thing
        // to show, and they're what you'd search the model browser for anyway.
        point: s.worldLocation,
        label: `[${s.modelIds.join(",")}]`,
        color: SCENERY_COLOR,
        faded: s.regionId !== regionId,
        thumbnail: thumbFor(s),
        hasModel: s.modelIds.length > 0,
        onClick: () => onSelectScenery(s.regionId, s.uuid),
      }));

    return [...sceneryMarkers, ...citizenMarkers];
  }, [entities, thumbs, plane, regionId, onSelectCitizen, onSelectScenery]);

  const localCitizens = entities.citizens.filter((c) => c.regionId === regionId).length;
  const localScenery = entities.scenery.filter((s) => s.regionId === regionId).length;
  // Only counts markers that could have a thumbnail - entries with no models never resolve
  // and would leave the indicator stuck forever.
  const pendingThumbs = markers.filter((m) => !m.thumbnail && m.hasModel).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <Legend color={CITIZEN_COLOR} label={`Citizens (${localCitizens} here)`} />
        <Legend color={SCENERY_COLOR} label={`Scenery (${localScenery} here)`} />
        {nearby && (
          <span style={{ opacity: 0.7 }}>
            Faded: {entities.citizens.length - localCitizens + (entities.scenery.length - localScenery)} from{" "}
            {Math.max(nearby.regionIds.length - 1, 0)} neighbouring region
            {nearby.regionIds.length === 2 ? "" : "s"} (radius {nearby.radius})
          </span>
        )}
        {pendingThumbs > 0 && <span style={{ opacity: 0.6 }}>rendering {pendingThumbs} thumbnails...</span>}
      </div>

      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}

      <div style={{ position: "relative" }}>
        <RegionTileMap
          regionId={regionId}
          plane={plane}
          position={null}
          markers={markers}
          onTileContextMenu={(point, screen) => setMenu({ point, screen })}
          height={height}
        />
        {menu && (
          <TileMenu
            menu={menu}
            onClose={() => setMenu(null)}
            onAddCitizen={() => {
              setMenu(null);
              onCreateCitizenAt(menu.point);
            }}
            onAddScenery={() => {
              setMenu(null);
              onCreateSceneryAt(menu.point);
            }}
          />
        )}
      </div>

      <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        Click a marker to edit it. Right-click a tile to add something there.
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function TileMenu({
  menu,
  onClose,
  onAddCitizen,
  onAddScenery,
}: {
  menu: ContextMenu;
  onClose: () => void;
  onAddCitizen: () => void;
  onAddScenery: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on any outside interaction or Escape, the way a native context menu behaves.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Deferred to the next frame: the right-click that opened this menu is still
    // propagating, and would otherwise immediately close it.
    const id = requestAnimationFrame(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("contextmenu", onDown);
    });
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "6px 12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
  };

  return (
    <div
      ref={ref}
      // Fixed rather than absolute: the coordinates come from the mouse event, which is in
      // viewport space, and the map sits inside a scrollable page.
      style={{
        position: "fixed",
        left: menu.screen.x,
        top: menu.screen.y,
        zIndex: 2000,
        background: "white",
        border: "1px solid #ccc",
        borderRadius: 6,
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        overflow: "hidden",
        minWidth: 170,
      }}
    >
      <div style={{ padding: "6px 12px", fontSize: 11, opacity: 0.65, borderBottom: "1px solid #eee" }}>
        Tile ({menu.point.x}, {menu.point.y}, z{menu.point.plane})
      </div>
      <button style={item} onClick={onAddCitizen}>
        Add citizen here
      </button>
      <button style={item} onClick={onAddScenery}>
        Add scenery here
      </button>
    </div>
  );
}
