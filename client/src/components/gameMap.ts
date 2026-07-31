import L from "leaflet";

// Shared Leaflet setup for every map in the app. Extracted from RegionMap so the
// world-scale region grid and the tile-scale region editor can't drift apart on CRS,
// tile source, or the row-index flip - getting any of those subtly wrong puts the whole
// world in the wrong place.

// OSRS region ids encode map coordinates: regionId = (regionX << 8) | regionY,
// where regionX/regionY are each a 64x64-tile chunk of the world.
export const REGION_SIZE = 64;

export function regionCoords(regionId: number): { regionX: number; regionY: number } {
  return { regionX: regionId >> 8, regionY: regionId & 0xff };
}

export function regionIdFromTile(x: number, y: number): number {
  return ((Math.floor(x / REGION_SIZE) << 8) | Math.floor(y / REGION_SIZE)) >>> 0;
}

// South-west corner (inclusive) of a region, in world tile coordinates.
export function regionOrigin(regionId: number): { x: number; y: number } {
  const { regionX, regionY } = regionCoords(regionId);
  return { x: regionX * REGION_SIZE, y: regionY * REGION_SIZE };
}

export function regionBounds(regionId: number): L.LatLngBounds {
  const { x, y } = regionOrigin(regionId);
  return L.latLngBounds([y, x], [y + REGION_SIZE, x + REGION_SIZE]);
}

// The base terrain tiles are the same publicly-published tile set (raw.githubusercontent.com,
// no auth/rate wall) that backs mejrs.github.io's OSRS map viewer, whose source configures
// this exact CRS/tileLayer/plane setup (see mejrs/mejrs.github.io: js/main/main_osrs.js).
export const TILE_URL =
  "https://raw.githubusercontent.com/mejrs/layers_osrs/refs/heads/master/mapsquares/-1/{z}/{plane}_{x}_{y}.png";

export const GameTileLayer = L.TileLayer.extend({
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

// Leaflet's CRS.Simple treats lat/lng as plain (y, x) game-tile coordinates, so every
// shape in these maps is drawn directly in game-tile units - no pixel math needed.
export function createGameMap(container: HTMLElement, options: { minZoom: number; maxZoom: number }): L.Map {
  return L.map(container, {
    crs: L.CRS.Simple,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom,
    attributionControl: false,
    fadeAnimation: false,
    zoomControl: false,
  });
}

export function addGameTileLayer(map: L.Map, plane: number, opts: { minZoom: number; maxZoom: number }): L.TileLayer {
  return new GameTileLayer(TILE_URL, {
    minZoom: opts.minZoom,
    maxZoom: opts.maxZoom,
    // The tile set has no imagery past zoom 4; beyond that Leaflet upscales the zoom-4
    // tiles rather than 404ing, which is what makes single-tile zoom levels usable.
    maxNativeZoom: 4,
    noWrap: true,
    plane,
  }).addTo(map);
}
