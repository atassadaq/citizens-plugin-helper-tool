# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local, browser-based dev tool for the [Citizens RuneLite plugin](https://github.com/atassadaq/citizensRunelite).
It browses regions, shows a citizen roster with real 3D thumbnails composited from the actual OSRS
game cache, lets you inspect/edit a citizen's raw model IDs and recolors with a live interactive
preview, and saves changes straight back into the plugin's `RegionData/*.json` files.

This tool has **no build/runtime dependency on the Java/Gradle side of the plugin** - it only reads
and writes its JSON data files on disk, plus reads model data directly from the local OSRS game cache.

## Setup & commands

```
cp .env.example .env   # adjust CITIZENS_REPO_PATH / JAGEX_CACHE_PATH if not using the defaults
npm install
npm run dev             # starts API server + Vite client together (root workspace script)
```

- Vite prints the client URL (defaults to http://localhost:5173); the API server listens on
  `PORT` from `.env` (defaults to 5175), proxied from the client under `/api` (see `client/vite.config.ts`).
- `npm run dev -w server` / `npm run dev -w client` to run either half alone.
- `npm run build -w client` builds the client (`vite build`); the server has no build step, it runs
  directly via `tsx watch` in dev and has no production entrypoint.
- No test suite and no lint config currently exist in this repo.
- Typecheck a single workspace with `npx tsc --noEmit` from `server/` or `client/`.

### Prerequisites

- Node.js >= 18
- A local checkout of `citizensRunelite` (path set via `CITIZENS_REPO_PATH` in `.env`)
- Having logged into RuneLite at least once, so `%USERPROFILE%\.runelite\jagexcache\oldschool\LIVE\`
  is populated with a real game cache - this tool reads models directly from that local cache via
  `osrscachereader`.

### Known benign warning

On startup you'll see `error reading index 16 pos 0 RangeError...` in the server log. This comes
from `osrscachereader` failing to parse an unrelated cache index (world-map data, index 16), not
model data. It doesn't affect model loading/rendering.

## Architecture

npm workspaces monorepo: `shared` (types only), `server` (Express API), `client` (React + Vite).

**`shared/src/types.ts` is the contract with the Java plugin.** These types mirror
`citizensRunelite`'s `src/main/java/com/magnaboy/serialization/*.java` classes field-for-field -
Gson matches by exact Java field name with no custom serialized-name adapters, so field names/casing
here must match the Java side exactly. Read the comments in that file before touching any type -
several fields have non-obvious constraints enforced only by the Java loader:
- `version` must serialize as exactly the number `0.8`, or `CitizenRegion.loadRegion` silently
  discards the entire file with no error logged.
- `CitizenInfo.remarks` must always be an array, never null, or the Java `Citizen.validate()` NPEs.
- `wanderBoxBL`/`wanderBoxTR` are required iff `entityType === "WanderingCitizen"`.
- `scale`/`translate` are passed through as-is; the Java side negates axes internally at render time.

**Server (`server/src/`)** is a thin Express API over two independent concerns:
- `regionRepo.ts` - reads/writes `RegionData/<regionId>.json` files. `writeRegionFile` always does a
  full-file rewrite (never a per-entity patch), matching the Java plugin's own
  `CitizenPanel`/`saveDirtyRegions` save behavior, and re-applies Gson's default `htmlSafe` escaping
  (`'`, `<`, `>`, `&`, `=` → `\uXXXX`) after `JSON.stringify` so saves stay byte-identical in format
  to what the Java plugin itself writes - without this, the two save paths fight over the same
  characters on every edit and produce escaping-only diff noise. `assertValidCitizen` enforces the
  same invariants the Java loader silently depends on (see above).
- `rsCache.ts` / `renderService.ts` - a singleton `RSCache` (from `osrscachereader`) loaded once at
  startup and kept warm for the process lifetime, used to look up model definitions by ID, apply
  recolors, merge multiple sub-models into one, and export as GLTF text. Rendered GLTFs are cached
  in-memory by `modelIds|recolorFind|recolorReplace` key for the life of the process.
- `config.ts` resolves `.env` relative to the file itself (not `process.cwd()`), since npm
  workspaces run `dev` scripts with cwd set to the workspace package dir, not the repo root. It
  fails fast at startup if `RegionData` or the Jagex cache dir don't exist.
- Server startup blocks on `cacheReady` (the `RSCache` load promise) before listening.

**Client (`client/src/`)** is a hand-rolled three-view state machine (`App.tsx`, no router) -
region list → region detail (citizen/scenery roster) → citizen editor - passing plain
`{ name, ...params }` view objects through `useState`.
- `views/RegionListView.tsx` has two display modes: a Leaflet-based map (`components/RegionMap.tsx`,
  using static region-boundary/place-name data from `data/osrsLocations.ts`) and a plain filterable
  table. Map mode renders fullscreen with floating HUD panels, outside the padded layout every other
  view uses.
- `views/RegionDetailView.tsx` renders a citizen roster grid; each `CitizenCard` requests a render
  and thumbnail independently. Scenery is listed read-only (v1 doesn't support editing it).
- `views/CitizenEditorView.tsx` edits `modelIds` (via `components/ModelPicker.tsx`) and
  `modelRecolorFind`/`modelRecolorReplace` (via `components/CsvArrayInput.tsx`), with a debounced
  (400ms) live 3D preview, then saves via `api.saveCitizen` (a full-object PUT-style POST, not a
  patch). Saving is blocked while the two recolor arrays are momentarily different lengths
  mid-edit, rather than surfacing a transient server validation error.
- **Two separate three.js rendering strategies, by design** - not an inconsistency to unify:
  - `three/thumbnailRenderer.ts`: one shared, reused `WebGLRenderer` that snapshots each model to a
    PNG data URL for `<img>` display. Used for roster grids and `ModelPicker` thumbnails, where up
    to ~40 live canvases would exceed the browser's WebGL context limit (commonly ~8-16).
    Thumbnails are cached client-side by `modelId|recolorFind|recolorReplace` key.
  - `three/LiveViewer.tsx`: one persistent, interactive `OrbitControls` canvas, used only in the
    citizen editor (one instance at a time). Auto-frames whatever model loads, since models vary
    wildly in size/offset.

## Scope (v1)

Region list, citizen roster thumbnails, citizen editor for `modelIds` +
`modelRecolorFind`/`modelRecolorReplace` with a live 3D preview. Scenery is listed read-only;
editing scenery, `mergedObjects`, and `startScript`/scripted behavior are not yet supported.
