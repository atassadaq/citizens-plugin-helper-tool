# Citizens Plugin Helper Tool

A local, browser-based dev tool for the [Citizens RuneLite plugin](https://github.com/atassadaq/citizensRunelite).
Browse regions, see a citizen roster with real 3D thumbnails composited from the actual OSRS
game cache, open a citizen to inspect/edit its raw model IDs and recolors with a live interactive
preview, and save changes straight back into the plugin's `RegionData/*.json` files.

This tool has no build/runtime dependency on the Java/Gradle side of the plugin — it only reads
and writes its JSON data files on disk.

## Prerequisites

- Node.js >= 18
- A local checkout of [citizensRunelite](https://github.com/atassadaq/citizensRunelite)
- Having logged into RuneLite at least once, so `%USERPROFILE%\.runelite\jagexcache\oldschool\LIVE\`
  is populated with a real game cache (this tool reads models directly from that local cache)

## Setup

```
cp .env.example .env   # adjust CITIZENS_REPO_PATH / JAGEX_CACHE_PATH if not using the defaults
npm install
npm run dev
```

This starts the API server and the Vite dev client together. Open the URL Vite prints
(defaults to http://localhost:5173).

## Known benign warning

On startup you'll see a line like `error reading index 16 pos 0 RangeError...` in the server
log. This comes from `osrscachereader` failing to parse an unrelated cache index (world-map
data, index 16), not model data. It doesn't affect model loading/rendering and can be ignored.

## Scope (v1)

- Region list, citizen roster thumbnails, citizen editor for `modelIds` +
  `modelRecolorFind`/`modelRecolorReplace` with a live 3D preview.
- Scenery is listed read-only; editing scenery, `mergedObjects`, and `startScript`/scripted
  behavior are not yet supported.
