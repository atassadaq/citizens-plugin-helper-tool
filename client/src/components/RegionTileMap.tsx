import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WorldPoint } from "@citizens-helper/shared/src/types";
import { addGameTileLayer, createGameMap, regionBounds } from "./gameMap";

export type MapMarker = {
  // Stable identity, so a marker can be rebuilt in place when its thumbnail arrives.
  id: string;
  point: WorldPoint;
  label: string;
  color: string;
  // Dimmed - used for entities that are context rather than the thing being placed.
  faded?: boolean;
  // Rendered model snapshot (data URL). Markers show a plain coloured dot until it lands,
  // so the map is usable before hundreds of thumbnails have finished rendering.
  thumbnail?: string | null;
  // Whether a thumbnail is even possible - lets callers distinguish "still rendering" from
  // "this entity has no models", which never resolves.
  hasModel?: boolean;
  // Makes the marker clickable; without it the marker stays non-interactive so it can't
  // swallow map clicks meant for tile placement.
  onClick?: () => void;
};

export type WanderBox = { bl: WorldPoint; tr: WorldPoint };

// The Java side requires bottomLeft to actually be to the bottom/left of topRight
// (Util.calculateBoundingBox throws otherwise), so corners are normalized the moment
// they're produced rather than trusting the drag/handle direction.
function normalizeBox(a: WorldPoint, b: WorldPoint, plane: number): WanderBox {
  return {
    bl: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), plane },
    tr: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), plane },
  };
}

// A box covers both corner tiles inclusively, so the rectangle is drawn to the far edge
// of the top-right tile.
function boxBounds(box: WanderBox): L.LatLngBounds {
  return L.latLngBounds([box.bl.y, box.bl.x], [box.tr.y + 1, box.tr.x + 1]);
}

type Props = {
  regionId: number;
  plane: number;
  // The citizen being placed. Dragging it or clicking a tile moves it.
  position: WorldPoint | null;
  onPositionChange?: (point: WorldPoint) => void;
  // WanderingCitizen box, drawn as a rectangle between two corners. When
  // onWanderBoxChange is supplied the corners also get draggable handles.
  wanderBox?: WanderBox | null;
  onWanderBoxChange?: (box: WanderBox) => void;
  // ScriptedCitizen route: ordered waypoints joined by a line, in script order.
  route?: WorldPoint[];
  onRouteAppend?: (point: WorldPoint) => void;
  markers?: MapMarker[];
  // Which click target the next map click feeds. "position" is the default; the route
  // builder switches this to "route" while you're laying down waypoints, and "wanderBox"
  // turns the map into a drag-to-draw surface.
  clickMode?: "position" | "route" | "wanderBox";
  // Right-clicking a tile. `screen` is viewport coordinates, for positioning a menu.
  onTileContextMenu?: (point: WorldPoint, screen: { x: number; y: number }) => void;
  height?: number;
};

// Zoom range is tighter than the world map's: this view is always scoped to one 64x64
// region, and at zoom 8 a single game tile is 256px, which is what makes clicking an
// individual tile practical.
const MIN_ZOOM = 2;
const MAX_ZOOM = 8;

// Below this on-screen tile size (px), the per-tile grid becomes visual noise.
const MIN_TILE_GRID_PX = 10;

// Draws the 1-tile grid inside the region on canvas tiles, so cost scales with screen
// area rather than with the 4096 tiles a region contains.
const TileGridLayer = L.GridLayer.extend({
  createTile(this: any, coords: L.Coords) {
    const size = this.getTileSize();
    const tile = L.DomUtil.create("canvas") as HTMLCanvasElement;
    tile.width = size.x;
    tile.height = size.y;
    const ctx = tile.getContext("2d");
    if (!ctx) return tile;

    const bounds = this._tileCoordsToBounds(coords);
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const worldPerPx = (east - west) / size.x;
    if (1 / worldPerPx < MIN_TILE_GRID_PX) return tile;

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(west); x <= east; x++) {
      const px = Math.round((x - west) / worldPerPx) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size.y);
    }
    for (let y = Math.floor(north); y >= south; y--) {
      const py = Math.round((north - y) / worldPerPx) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(size.x, py);
    }
    ctx.stroke();
    return tile;
  },
}) as unknown as new (options?: L.GridLayerOptions) => L.GridLayer;

// A game tile spans [x, x+1); its centre - where a marker should sit - is +0.5.
function tileCentre(point: WorldPoint): L.LatLngExpression {
  return [point.y + 0.5, point.x + 0.5];
}

function tileFromLatLng(latlng: L.LatLng, plane: number): WorldPoint {
  return { x: Math.floor(latlng.lng), y: Math.floor(latlng.lat), plane };
}

// Marker labels come from citizen names in the plugin's own data files, which are free
// text - so they're escaped before going into divIcon HTML.
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

function dotIcon(color: string, label: string, faded: boolean, thumbnail?: string | null) {
  // The thumbnail replaces the dot rather than sitting beside it: at region zoom a row of
  // dot + picture + name per citizen turns into unreadable clutter very quickly.
  const badge = thumbnail
    ? `<img src="${thumbnail}" width="34" height="34" style="
         display:block;flex:none;border-radius:4px;border:2px solid ${color};
         background:rgba(20,22,28,0.75);box-shadow:0 0 3px #000;" />`
    : `<span style="width:12px;height:12px;border-radius:50%;background:${color};
         border:2px solid #fff;box-shadow:0 0 3px #000;flex:none;"></span>`;
  const offset = thumbnail ? "translate(-17px,-17px)" : "translate(-6px,-6px)";

  return L.divIcon({
    className: "citizen-map-marker",
    html: `<div style="
      display:flex;align-items:center;gap:4px;transform:${offset};
      opacity:${faded ? 0.5 : 1};white-space:nowrap;">
      ${badge}
      <span style="font-size:11px;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000;">${escapeHtml(label)}</span>
    </div>`,
  });
}

// Corner grips for the wander box. Square rather than round so they read as "resize this
// rectangle" instead of "another citizen is here".
function cornerIcon(label: string) {
  return L.divIcon({
    className: "citizen-map-marker",
    html: `<div style="
      width:14px;height:14px;transform:translate(-7px,-7px);background:#f0ad4e;
      border:2px solid #fff;box-shadow:0 0 3px #000;cursor:move;" title="${label}"></div>`,
  });
}

export function RegionTileMap({
  regionId,
  plane,
  position,
  onPositionChange,
  wanderBox,
  onWanderBoxChange,
  route = [],
  onRouteAppend,
  markers = [],
  clickMode = "position",
  onTileContextMenu,
  height = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  // The in-progress drag rectangle lives outside the overlay group, which is cleared and
  // rebuilt whenever the committed props change.
  const drawRef = useRef<{ anchor: WorldPoint | null; preview: L.Rectangle | null }>({
    anchor: null,
    preview: null,
  });

  // Handlers are held in refs so the map is built exactly once: rebuilding it on every
  // prop change would reset the user's pan/zoom mid-edit.
  const handlers = useRef({
    onPositionChange,
    onRouteAppend,
    onWanderBoxChange,
    onTileContextMenu,
    clickMode,
    plane,
  });
  handlers.current = { onPositionChange, onRouteAppend, onWanderBoxChange, onTileContextMenu, clickMode, plane };

  useEffect(() => {
    const map = createGameMap(containerRef.current!, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    mapRef.current = map;
    map.fitBounds(regionBounds(regionId), { animate: false });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    tileLayerRef.current = addGameTileLayer(map, plane, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
    new TileGridLayer({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, noWrap: true }).addTo(map);

    // Region outline, so it's obvious when you're about to place a citizen outside the
    // region whose file you're editing.
    L.rectangle(regionBounds(regionId), { color: "#4a90e2", weight: 2, fill: false }).addTo(map);

    overlayRef.current = L.layerGroup().addTo(map);

    const onClick = (e: L.LeafletMouseEvent) => {
      // In wanderBox mode the box is committed on mouseup, so a click would otherwise
      // also move the citizen underneath the drag.
      if (handlers.current.clickMode === "wanderBox") return;
      const point = tileFromLatLng(e.latlng, handlers.current.plane);
      if (handlers.current.clickMode === "route") {
        handlers.current.onRouteAppend?.(point);
      } else {
        handlers.current.onPositionChange?.(point);
      }
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (handlers.current.clickMode !== "wanderBox") return;
      const anchor = tileFromLatLng(e.latlng, handlers.current.plane);
      const preview = L.rectangle(boxBounds({ bl: anchor, tr: anchor }), {
        color: "#f0ad4e",
        weight: 2,
        dashArray: "5 4",
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(map);
      drawRef.current = { anchor, preview };
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const { anchor, preview } = drawRef.current;
      if (!anchor || !preview) return;
      const corner = tileFromLatLng(e.latlng, handlers.current.plane);
      preview.setBounds(boxBounds(normalizeBox(anchor, corner, handlers.current.plane)));
    };

    const endDraw = (e: L.LeafletMouseEvent) => {
      const { anchor, preview } = drawRef.current;
      if (!anchor) return;
      if (preview) map.removeLayer(preview);
      drawRef.current = { anchor: null, preview: null };
      const corner = tileFromLatLng(e.latlng, handlers.current.plane);
      handlers.current.onWanderBoxChange?.(normalizeBox(anchor, corner, handlers.current.plane));
    };

    const onContextMenu = (e: L.LeafletMouseEvent) => {
      if (!handlers.current.onTileContextMenu) return;
      // Leaflet only suppresses the browser menu when something is listening, and this
      // listener is conditional, so it's suppressed explicitly here.
      L.DomEvent.preventDefault(e.originalEvent);
      const point = tileFromLatLng(e.latlng, handlers.current.plane);
      handlers.current.onTileContextMenu(point, {
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
      });
    };

    map.on("click", onClick);
    map.on("contextmenu", onContextMenu);
    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", endDraw);
    // Releasing outside the map would otherwise leave a preview rectangle stuck on screen.
    map.on("mouseout", endDraw);

    return () => {
      map.off("click", onClick);
      map.off("contextmenu", onContextMenu);
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", endDraw);
      map.off("mouseout", endDraw);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      overlayRef.current = null;
    };
  }, [regionId]);

  // Panning and drawing both claim mouse-drag, so the map's own drag handler is turned off
  // for as long as the box tool is armed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (clickMode === "wanderBox") {
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    }
  }, [clickMode]);

  useEffect(() => {
    const layer = tileLayerRef.current;
    if (!layer) return;
    (layer.options as any).plane = plane;
    layer.redraw();
  }, [plane]);

  // Callers build `wanderBox` and `route` inline, so those props are fresh objects on every
  // render and can't be used as effect deps directly - the overlay would be torn down and
  // rebuilt on each keystroke anywhere in the editor. Comparing by serialized value instead
  // means it only redraws when something actually moved.
  //
  // Markers are reduced to their visible fields rather than serialized whole: `thumbnail`
  // holds a PNG data URL, and stringifying 150 of those would build a multi-megabyte string
  // on every render. Only whether a thumbnail is present matters for redraw.
  const overlayKey = JSON.stringify({
    markers: markers.map((m) => [
      m.id,
      m.point.x,
      m.point.y,
      m.point.plane,
      m.label,
      m.color,
      m.faded ?? false,
      m.thumbnail ? 1 : 0,
    ]),
    wanderBox,
    route,
    position,
  });

  // One effect redraws every overlay: they're cheap (a handful of shapes) and keeping
  // them in a single layer group avoids ordering bugs between separate add/remove passes.
  useEffect(() => {
    const group = overlayRef.current;
    if (!group) return;
    group.clearLayers();

    for (const marker of markers) {
      const leafletMarker = L.marker(tileCentre(marker.point), {
        icon: dotIcon(marker.color, marker.label, marker.faded ?? false, marker.thumbnail),
        // Only clickable markers are interactive; otherwise they'd swallow map clicks
        // meant for placing a position or drawing a box.
        interactive: !!marker.onClick,
      });
      if (marker.onClick) {
        leafletMarker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          marker.onClick!();
        });
      }
      leafletMarker.addTo(group);
    }

    if (wanderBox) {
      const box = normalizeBox(wanderBox.bl, wanderBox.tr, wanderBox.bl.plane);
      L.rectangle(boxBounds(box), { color: "#f0ad4e", weight: 2, fillOpacity: 0.15, interactive: false }).addTo(group);

      // Handles let you nudge one corner without redrawing the whole box, which is the
      // common case once the rough area is right.
      if (onWanderBoxChange) {
        const corners: { key: "bl" | "tr"; point: WorldPoint; label: string }[] = [
          { key: "bl", point: box.bl, label: "Bottom-left" },
          { key: "tr", point: box.tr, label: "Top-right" },
        ];
        for (const corner of corners) {
          const handle = L.marker(tileCentre(corner.point), {
            icon: cornerIcon(corner.label),
            draggable: true,
          });
          handle.on("dragend", () => {
            const moved = tileFromLatLng(handle.getLatLng(), handlers.current.plane);
            const other = corner.key === "bl" ? box.tr : box.bl;
            handlers.current.onWanderBoxChange?.(normalizeBox(moved, other, handlers.current.plane));
          });
          handle.addTo(group);
        }
      }
    }

    if (route.length > 0) {
      L.polyline(route.map(tileCentre), { color: "#5cb85c", weight: 2, dashArray: "4 3" }).addTo(group);
      route.forEach((point, i) => {
        L.marker(tileCentre(point), {
          icon: dotIcon("#5cb85c", String(i + 1), false),
          interactive: false,
        }).addTo(group);
      });
    }

    if (position) {
      const marker = L.marker(tileCentre(position), {
        icon: dotIcon("#d9534f", "", false),
        draggable: !!onPositionChange,
      });
      marker.on("dragend", () => {
        handlers.current.onPositionChange?.(tileFromLatLng(marker.getLatLng(), handlers.current.plane));
      });
      marker.addTo(group);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <style>{`.leaflet-div-icon.citizen-map-marker { background: transparent; border: none; }`}</style>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#12141a", borderRadius: 6 }} />
    </div>
  );
}
