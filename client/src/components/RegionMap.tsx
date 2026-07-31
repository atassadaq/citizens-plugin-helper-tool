import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RegionSummary } from "@citizens-helper/shared/src/types";
import { OSRS_LOCATIONS } from "../data/osrsLocations";
import type { OsrsLocation } from "../data/osrsLocations";

type Props = {
  regions: RegionSummary[];
  onSelectRegion: (regionId: number) => void;
  showAllRegions: boolean;
  showPlaceNames: boolean;
  plane: number;
};

// OSRS region ids encode map coordinates: regionId = (regionX << 8) | regionY,
// where regionX/regionY are each a 64x64-tile chunk of the world.
function regionCoords(regionId: number): { regionX: number; regionY: number } {
  return { regionX: regionId >> 8, regionY: regionId & 0xff };
}

// regionX/regionY are each stored as a single byte in regionId, so 0-255 bounds the
// entire space of representable regions, valid game content or not.
const REGION_AXIS_MAX = 255;
const WORLD_MAX = (REGION_AXIS_MAX + 1) * 64;

// Initial view: zoomed to the mainland-spanning box between these two corner regions,
// rather than fitting to whatever citizen/scenery data happens to be loaded - some of
// that data sits on far-flung islands/instances, which previously forced the initial
// view to zoom out to fit the entire world.
const DEFAULT_VIEW_CORNER_A = 3905;
const DEFAULT_VIEW_CORNER_B = 15904;
function defaultViewBounds(): L.LatLngBounds {
  const a = regionCoords(DEFAULT_VIEW_CORNER_A);
  const b = regionCoords(DEFAULT_VIEW_CORNER_B);
  const minX = Math.min(a.regionX, b.regionX) * 64;
  const maxX = (Math.max(a.regionX, b.regionX) + 1) * 64;
  const minY = Math.min(a.regionY, b.regionY) * 64;
  const maxY = (Math.max(a.regionY, b.regionY) + 1) * 64;
  return L.latLngBounds([minY, minX], [maxY, maxX]);
}

// Below this on-screen cell size (in px), individual region-id labels stop being legible.
const MIN_LABEL_PX = 28;

// Leaflet's CRS.Simple treats lat/lng as plain (y, x) game-tile coordinates, so
// rectangles/labels below are drawn directly in game-tile units - no pixel math needed.
// The base terrain tiles are the same publicly-published tile set (raw.githubusercontent.com,
// no auth/rate wall) that backs mejrs.github.io's OSRS map viewer, whose source configures
// this exact CRS/tileLayer/plane setup (see mejrs/mejrs.github.io: js/main/main_osrs.js).
const GameTileLayer = L.TileLayer.extend({
  getTileUrl(this: L.TileLayer, coords: L.Coords) {
    // The tile set's row index runs opposite Leaflet's internal CRS.Simple numbering,
    // so it has to be re-flipped per tile - mirrors L.TileLayer.Main.getTileUrl upstream.
    return L.Util.template((this as any)._url, {
      ...(this as any).options,
      z: coords.z,
      x: coords.x,
      y: -(1 + coords.y),
    });
  },
}) as unknown as new (url: string, options?: L.TileLayerOptions & { plane: number }) => L.TileLayer;

const TILE_URL = "https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/mapsquares/-1/{z}/{plane}_{x}_{y}.png";

// Draws region boundary lines (and, once zoomed in enough, region-id text) directly onto
// canvas tiles instead of one Leaflet vector shape per region. Cost per frame is bounded by
// how many tiles are on screen (a handful), not by how many of the 256x256 possible regions
// exist - so panning/zooming stays smooth even with "show all regions" on at any zoom level.
type RegionGridLayerInstance = L.GridLayer & { populated: Set<number> };
const RegionGridLayer = L.GridLayer.extend({
  populated: new Set<number>(),

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
    const cellPx = 64 / worldPerPx;

    ctx.strokeStyle = "rgba(190,190,190,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.max(0, Math.ceil(west / 64) * 64); x <= Math.min(WORLD_MAX, east); x += 64) {
      const px = Math.round((x - west) / worldPerPx) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, size.y);
    }
    for (let y = Math.min(WORLD_MAX, Math.floor(north / 64) * 64); y >= Math.max(0, south); y -= 64) {
      const py = Math.round((north - y) / worldPerPx) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(size.x, py);
    }
    ctx.stroke();

    if (cellPx >= MIN_LABEL_PX) {
      const populated: Set<number> = this.populated;
      ctx.fillStyle = "#cfcfcf";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 3;

      const minRX = Math.max(0, Math.floor(west / 64));
      const maxRX = Math.min(REGION_AXIS_MAX, Math.ceil(east / 64) - 1);
      const minRY = Math.max(0, Math.floor(south / 64));
      const maxRY = Math.min(REGION_AXIS_MAX, Math.ceil(north / 64) - 1);

      for (let regionX = minRX; regionX <= maxRX; regionX++) {
        for (let regionY = minRY; regionY <= maxRY; regionY++) {
          const regionId = (regionX << 8) | regionY;
          if (populated.has(regionId)) continue; // populated regions get their own label layer
          const cx = (regionX * 64 + 32 - west) / worldPerPx;
          const cy = (north - (regionY * 64 + 32)) / worldPerPx;
          ctx.fillText(String(regionId), cx, cy);
        }
      }
    }

    return tile;
  },
}) as unknown as new (options?: L.GridLayerOptions) => RegionGridLayerInstance;

function regionLabelIcon(regionId: number, visible: boolean) {
  return L.divIcon({
    className: "region-id-label",
    html: `<span style="font-size:13px;color:#eee;text-shadow:0 0 2px #000,0 0 2px #000;white-space:nowrap;display:${visible ? "" : "none"};">${regionId}</span>`,
  });
}

export function RegionMap({ regions, onSelectRegion, showAllRegions, showPlaceNames, plane }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const populatedLayerRef = useRef<L.LayerGroup | null>(null);
  const gridLayerRef = useRef<RegionGridLayerInstance | null>(null);
  const placeNameLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectRegion);
  onSelectRef.current = onSelectRegion;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const showAllRegionsRef = useRef(showAllRegions);
  showAllRegionsRef.current = showAllRegions;

  useEffect(() => {
    const map = L.map(containerRef.current!, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 8,
      attributionControl: false,
      fadeAnimation: false,
      zoomControl: false,
    });
    map.fitBounds(defaultViewBounds(), { animate: false });
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);

    tileLayerRef.current = new GameTileLayer(TILE_URL, {
      minZoom: -4,
      maxZoom: 8,
      maxNativeZoom: 4,
      noWrap: true,
      plane: 0,
    }).addTo(map);

    const gridLayer = new RegionGridLayer({ minZoom: -4, maxZoom: 8, noWrap: true, opacity: 1 });
    gridLayerRef.current = gridLayer;

    populatedLayerRef.current = L.layerGroup().addTo(map);
    placeNameLayerRef.current = L.layerGroup().addTo(map);

    const updateLabelVisibility = () => {
      const cellPx = 64 * Math.pow(2, map.getZoom());
      const show = cellPx >= MIN_LABEL_PX;
      containerRef.current?.querySelectorAll<HTMLElement>(".region-id-label span").forEach((el) => {
        el.style.display = show ? "" : "none";
      });
    };
    map.on("zoomend", updateLabelVisibility);

    // Single click handler computes the clicked region from world coords directly, rather
    // than attaching a click listener per grid cell - keeps "show all regions" cheap no
    // matter how many empty regions are on screen. Populated regions get their own rectangle
    // click handler (below); this only fires navigation for non-populated cells.
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (!showAllRegionsRef.current) return;
      const regionX = Math.floor(e.latlng.lng / 64);
      const regionY = Math.floor(e.latlng.lat / 64);
      if (regionX < 0 || regionX > REGION_AXIS_MAX || regionY < 0 || regionY > REGION_AXIS_MAX) return;
      const regionId = (regionX << 8) | regionY;
      if (regionsRef.current.some((r) => r.regionId === regionId)) return;
      onSelectRef.current(regionId);
    };
    map.on("click", onMapClick);

    return () => {
      map.off("zoomend", updateLabelVisibility);
      map.off("click", onMapClick);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      populatedLayerRef.current = null;
      gridLayerRef.current = null;
      placeNameLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = tileLayerRef.current;
    if (!layer) return;
    (layer.options as any).plane = plane;
    layer.redraw();
  }, [plane]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = populatedLayerRef.current;
    const gridLayer = gridLayerRef.current;
    if (!map || !layerGroup || !gridLayer) return;
    layerGroup.clearLayers();

    if (regions.length > 0) {
      // Uses whatever zoom/pan the map is currently at rather than fitting to this data's
      // bounds - some citizen/scenery data sits on far-flung islands/instances, and fitting
      // to it here would fight the fixed initial view and reset the user's pan/zoom on
      // every data change (e.g. typing in the region-id filter).
      const cellPx = 64 * Math.pow(2, map.getZoom());
      const showLabels = cellPx >= MIN_LABEL_PX;

      for (const r of regions) {
        const { regionX, regionY } = regionCoords(r.regionId);
        const worldX = regionX * 64;
        const worldY = regionY * 64;
        const bounds = L.latLngBounds([worldY, worldX], [worldY + 64, worldX + 64]);

        const hasCitizens = r.citizenCount > 0;
        const hasScenery = r.sceneryCount > 0;
        const color = hasCitizens ? "#4a90e2" : hasScenery ? "#5cb85c" : "#cccccc";

        const rect = L.rectangle(bounds, { color, weight: 1, fillOpacity: 0.3 });
        rect.bindTooltip(`Region ${r.regionId} &middot; ${r.citizenCount} citizens, ${r.sceneryCount} scenery`);
        rect.on("click", () => onSelectRef.current(r.regionId));
        rect.addTo(layerGroup);

        L.marker(bounds.getCenter(), { interactive: false, icon: regionLabelIcon(r.regionId, showLabels) }).addTo(layerGroup);
      }
    }

    gridLayer.populated = new Set(regions.map((r) => r.regionId));
    gridLayer.redraw();
  }, [regions]);

  useEffect(() => {
    const map = mapRef.current;
    const gridLayer = gridLayerRef.current;
    if (!map || !gridLayer) return;
    if (showAllRegions) {
      gridLayer.addTo(map);
    } else {
      gridLayer.remove();
    }
  }, [showAllRegions]);

  useEffect(() => {
    const layerGroup = placeNameLayerRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();
    if (!showPlaceNames) return;

    // Sizes/weights mirror explv's map hierarchy: cities are large and bold,
    // towns are medium, and guilds/minigames/landmarks are smaller - matching
    // the same visual scale used for region-id labels elsewhere on the map.
    const TIER_STYLE: Record<OsrsLocation["tier"], { size: number; weight: number }> = {
      0: { size: 22, weight: 700 },
      1: { size: 16, weight: 600 },
      2: { size: 13, weight: 400 },
    };

    for (const loc of OSRS_LOCATIONS) {
      const { size, weight } = TIER_STYLE[loc.tier];
      const marker = L.marker([loc.y, loc.x], {
        interactive: false,
        icon: L.divIcon({
          className: "osrs-place-label",
          html: `<span style="
            font-family: Georgia, 'Times New Roman', serif;
            font-weight: ${weight};
            font-size: ${size}px;
            color: #f2e2b6;
            text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000;
            white-space: nowrap;
            transform: translate(-50%, -50%);
            display: inline-block;
          ">${loc.name}</span>`,
        }),
      });
      marker.addTo(layerGroup);
    }
  }, [showPlaceNames]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{`
        .leaflet-div-icon.region-id-label, .leaflet-div-icon.osrs-place-label {
          background: transparent;
          border: none;
        }
      `}</style>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#12141a" }} />
    </div>
  );
}
