# Favorites + Inline Model Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user favorite NPCs/objects/items (cache-derived Entity Browser entries) and citizens/scenery (RegionData entries), snapshotting models/recolors/animations for reuse; add a favorites-only filter and a cross-kind Favorites page; add a click-to-preview live 3D panel to the Entity Browser grid.

**Architecture:** One unified `FavoriteEntry` type stored server-side in `server/data/favorites.json` via a thin Express router (mirroring the existing `scriptRepo.ts`/`routes/scripts.ts` pattern). A client-side `FavoritesContext` loads the list once and exposes optimistic add/remove. A new `EntityPreviewGrid` component (extracted from `EntityBrowserView`) provides the shared click-to-select sticky-live-preview-panel UI used by both the Entity Browser and the new Favorites page.

**Tech Stack:** TypeScript, React 18 (no router-agnostic view components - navigation stays in `App.tsx`'s route wrappers), Express, `three.js` (existing `LiveViewer`), plain `fs/promises` for storage (no DB).

**Spec:** `docs/superpowers/specs/2026-07-31-favorites-model-viewer-design.md`

## Global Constraints

- No test suite or lint config exists in this repo (confirmed in this repo's `CLAUDE.md`). Every task's verification step is manual: `npx tsc --noEmit` for type safety, `curl` for new API routes, and described browser interactions for UI - not a new test framework. Do not introduce one as part of this feature.
- `shared/src/types.ts` types that mirror the Java plugin (`CitizenInfo`, `EntityInfo`, etc.) must NOT be touched - `FavoriteEntry`/`FavoriteKind` are new, tool-only types with no relationship to the Gson round-trip contract documented at the top of that file.
- `server/data/` (new directory, holds `favorites.json`) must be added to `.gitignore` - personal, machine-local data, same treatment as `.env`.
- All new UI is inline `style={{ ... }}` props, matching every existing component in `client/src/` - no CSS files, no styled-components, no new styling library.
- Server-side relative imports use an explicit `.js` extension (ESM + `moduleResolution: Bundler`, e.g. `from "./config.js"`); client-side relative imports use no extension (Vite). Every existing file follows this split - match it exactly per side.
- Route/navigation logic stays in `client/src/App.tsx`'s route wrapper functions; view components (`EntityBrowserView`, the new `FavoritesView`, etc.) take `onSelect`/`onOpen`-style callback props and never call `useNavigate()` themselves. This matches every existing view in the app.

---

### Task 1: Shared `FavoriteEntry` type

**Files:**
- Modify: `shared/src/types.ts` (append after line 225, end of file)

**Interfaces:**
- Produces: `FavoriteKind` (type alias), `FavoriteEntry` (type), both exported from `@citizens-helper/shared/src/types`. Every later task imports these two names.

- [ ] **Step 1: Append the new types**

Add this to the end of `shared/src/types.ts` (after the closing `};` of `EntityPage`):

```ts

// ---------------------------------------------------------------------------
// Favorites (tool-only - NOT part of the Java plugin contract, unlike every
// other type in this file. Freely add/change fields here without touching
// CitizenRegion.java or any Gson round-trip behavior.)
// ---------------------------------------------------------------------------

export type FavoriteKind = "npc" | "object" | "item" | "citizen" | "scenery";

// A frozen snapshot, not a live pointer: editing or deleting the source
// (an NPC def changing, a citizen being deleted) does not change or invalidate
// an existing favorite. Re-favorite the same key to refresh it.
export type FavoriteEntry = {
  // Identity + dedup key. "npc:1234" / "object:5" / "item:9" for cache
  // entities; "citizen:<regionId>:<uuid>" / "scenery:<regionId>:<uuid>" for
  // RegionData entities.
  key: string;
  kind: FavoriteKind;
  // Display-only breadcrumb back to where this was favorited from, e.g.
  // "npc #1234" or "region 12086". Never used for lookups.
  sourceLabel: string;
  name: string | null;
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
  // Loose label->value bag rather than a discriminated union per kind: npc
  // snapshots carry numeric cache sequence ids (standing/walking), citizen/
  // scenery snapshots carry AnimationID name strings (idle/move). Empty `{}`
  // for object/item, which have no animation fields in the cache at all.
  animations: Record<string, string | number>;
  savedAt: string; // ISO timestamp, set server-side on create
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit` from `shared/` (there's no `tsconfig.json` in `shared/` itself - instead run it from `server/`, which depends on `@citizens-helper/shared` and will pick up any syntax error in the shared file):

```bash
cd server && npx tsc --noEmit
```

Expected: no errors (the new types aren't referenced anywhere yet, so this only checks the file parses and doesn't break existing usages of `shared/src/types.ts`).

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "Add FavoriteEntry/FavoriteKind types for the favorites feature"
```

---

### Task 2: Server storage + API routes for favorites

**Files:**
- Create: `server/src/favoritesRepo.ts`
- Create: `server/src/routes/favorites.ts`
- Modify: `server/src/index.ts:1-21`
- Modify: `.gitignore` (repo root, alongside `node_modules/`, `.env`, etc.)

**Interfaces:**
- Consumes: `FavoriteEntry` from Task 1.
- Produces: `listFavorites(): Promise<FavoriteEntry[]>`, `addFavorite(entry: Omit<FavoriteEntry, "savedAt">): Promise<FavoriteEntry>`, `removeFavorite(key: string): Promise<void>` (all from `favoritesRepo.ts`); `favoritesRouter` (Express `Router`, exported from `routes/favorites.ts`) exposing `GET /api/favorites`, `POST /api/favorites`, `DELETE /api/favorites/:key`. Task 3's client code calls these three HTTP endpoints directly.

- [ ] **Step 1: Write `server/src/favoritesRepo.ts`**

```ts
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types.js";

// Lives in the helper tool's own repo (server/data/), not under RegionData/Scripts in
// citizensRunelite - favorites aren't part of the Java plugin's Gson contract, so they
// get their own file rather than risking confusion with the plugin's own save routines.
const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const favoritesFile = path.join(dataDir, "favorites.json");

async function readAll(): Promise<FavoriteEntry[]> {
  try {
    const raw = await fs.readFile(favoritesFile, "utf-8");
    return JSON.parse(raw) as FavoriteEntry[];
  } catch (err) {
    // Missing file is the normal state for a fresh install - favorites aren't required
    // for the tool to function, unlike RegionData/the cache path in config.ts.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeAll(entries: FavoriteEntry[]): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(favoritesFile, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

export async function listFavorites(): Promise<FavoriteEntry[]> {
  return readAll();
}

// Upserts by key: re-favoriting an already-present key overwrites it in place rather than
// producing a duplicate, so a stale client retrying a request can't create two entries.
export async function addFavorite(entry: Omit<FavoriteEntry, "savedAt">): Promise<FavoriteEntry> {
  if (!entry.key || !entry.kind) {
    throw new Error("favorite must have a key and kind");
  }
  const entries = await readAll();
  const full: FavoriteEntry = { ...entry, savedAt: new Date().toISOString() };
  const next = [...entries.filter((e) => e.key !== full.key), full];
  await writeAll(next);
  return full;
}

// Idempotent: removing a key that isn't present is not an error (two tabs open, one
// already removed it).
export async function removeFavorite(key: string): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((e) => e.key !== key));
}
```

- [ ] **Step 2: Write `server/src/routes/favorites.ts`**

```ts
import { Router } from "express";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types.js";
import { addFavorite, listFavorites, removeFavorite } from "../favoritesRepo.js";

export const favoritesRouter = Router();

favoritesRouter.get("/favorites", async (_req, res) => {
  try {
    res.json(await listFavorites());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

favoritesRouter.post("/favorites", async (req, res) => {
  try {
    res.json(await addFavorite(req.body as Omit<FavoriteEntry, "savedAt">));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Express decodes URL-encoded path segments before populating req.params, so a key like
// "citizen:12086:41c4f935-..." (no special characters needing escaping) or a
// %3A-encoded one both arrive here already decoded - no manual decodeURIComponent needed
// (matching routes/scripts.ts's :name param, which also uses req.params directly).
favoritesRouter.delete("/favorites/:key", async (req, res) => {
  try {
    await removeFavorite(req.params.key);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
```

- [ ] **Step 3: Register the router in `server/src/index.ts`**

Current content (lines 1-21):

```ts
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { cacheReady } from "./rsCache.js";
import { statusRouter } from "./routes/status.js";
import { regionsRouter } from "./routes/regions.js";
import { renderRouter } from "./routes/render.js";
import { kitsRouter } from "./routes/kits.js";
import { entitiesRouter } from "./routes/entities.js";
import { scriptsRouter } from "./routes/scripts.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", statusRouter);
app.use("/api", regionsRouter);
app.use("/api", renderRouter);
app.use("/api", kitsRouter);
app.use("/api", entitiesRouter);
app.use("/api", scriptsRouter);
```

Replace with:

```ts
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { cacheReady } from "./rsCache.js";
import { statusRouter } from "./routes/status.js";
import { regionsRouter } from "./routes/regions.js";
import { renderRouter } from "./routes/render.js";
import { kitsRouter } from "./routes/kits.js";
import { entitiesRouter } from "./routes/entities.js";
import { scriptsRouter } from "./routes/scripts.js";
import { favoritesRouter } from "./routes/favorites.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", statusRouter);
app.use("/api", regionsRouter);
app.use("/api", renderRouter);
app.use("/api", kitsRouter);
app.use("/api", entitiesRouter);
app.use("/api", scriptsRouter);
app.use("/api", favoritesRouter);
```

- [ ] **Step 4: Add `server/data/` to `.gitignore`**

Current content:

```
node_modules/
.env
client/dist/
server/dist/
out/
*.gltf
.vscode/
.DS_Store
server/.cache/
```

Replace with:

```
node_modules/
.env
client/dist/
server/dist/
out/
*.gltf
.vscode/
.DS_Store
server/.cache/
server/data/
```

- [ ] **Step 5: Type-check**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start the server and verify the routes end-to-end**

```bash
npm run dev -w server
```

Expected console output ends with `Server listening on http://localhost:5175` (or whatever `PORT` is set to in `.env`). Leave it running and, in a second terminal, run:

```bash
curl -s http://localhost:5175/api/favorites
```

Expected: `[]` (no favorites yet, and no error about a missing file).

```bash
curl -s -X POST http://localhost:5175/api/favorites \
  -H "Content-Type: application/json" \
  -d '{"key":"npc:1234","kind":"npc","sourceLabel":"npc #1234","name":"Test NPC","modelIds":[1,2],"recolorFind":[],"recolorReplace":[],"animations":{"standing":808}}'
```

Expected: the same object echoed back with a `savedAt` timestamp added.

```bash
curl -s http://localhost:5175/api/favorites
```

Expected: a one-element array containing that entry. Confirm `server/data/favorites.json` now exists on disk with the same content.

```bash
curl -s -X DELETE http://localhost:5175/api/favorites/npc%3A1234 -o /dev/null -w "%{http_code}\n"
```

Expected: `204`.

```bash
curl -s http://localhost:5175/api/favorites
```

Expected: `[]` again. Stop the server (Ctrl+C).

- [ ] **Step 7: Commit**

```bash
git add server/src/favoritesRepo.ts server/src/routes/favorites.ts server/src/index.ts .gitignore
git commit -m "Add server-side favorites storage and API routes"
```

---

### Task 3: Client API methods + `FavoritesContext`

**Files:**
- Modify: `client/src/api/client.ts:1-16` (type imports) and before the closing `};` (new methods)
- Create: `client/src/favorites/FavoritesContext.tsx`
- Modify: `client/src/main.tsx`

**Interfaces:**
- Consumes: `FavoriteEntry` (Task 1); `GET/POST/DELETE /api/favorites` (Task 2).
- Produces: `api.listFavorites()`, `api.addFavorite(entry)`, `api.removeFavorite(key)` (added to the `api` object in `client.ts`); `FavoritesProvider` (wraps `<App>`); `useFavorites(): { favorites: FavoriteEntry[]; isFavorite(key): boolean; toggle(key, build): Promise<void>; error: string | null }` from `client/src/favorites/FavoritesContext.tsx`. Tasks 4-7 all call `useFavorites()`.

- [ ] **Step 1: Add the `FavoriteEntry` import to `client/src/api/client.ts`**

Current import block (lines 1-16):

```ts
import type {
  CitizenInfo,
  CitizenRegionFile,
  EntityDetail,
  EntityKind,
  EntityPage,
  KitSummary,
  NearbyEntities,
  NearbyNpc,
  RegionSummary,
  RenderRequest,
  ScriptFile,
  ScriptSummary,
  SceneryInfo,
  StatusResponse,
} from "@citizens-helper/shared/src/types";
```

Replace with:

```ts
import type {
  CitizenInfo,
  CitizenRegionFile,
  EntityDetail,
  EntityKind,
  EntityPage,
  FavoriteEntry,
  KitSummary,
  NearbyEntities,
  NearbyNpc,
  RegionSummary,
  RenderRequest,
  ScriptFile,
  ScriptSummary,
  SceneryInfo,
  StatusResponse,
} from "@citizens-helper/shared/src/types";
```

- [ ] **Step 2: Add the three favorites methods**

Current end of the file (lines 101-115):

```ts
  render: (req: RenderRequest) =>
    fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => {
      if (!r.ok) {
        return r.json().then((body) => {
          throw new Error(body.error ?? `Render failed: ${r.status}`);
        });
      }
      return r.text();
    }),
};
```

Replace with:

```ts
  render: (req: RenderRequest) =>
    fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => {
      if (!r.ok) {
        return r.json().then((body) => {
          throw new Error(body.error ?? `Render failed: ${r.status}`);
        });
      }
      return r.text();
    }),

  listFavorites: () => fetch("/api/favorites").then((r) => json<FavoriteEntry[]>(r)),

  addFavorite: (entry: Omit<FavoriteEntry, "savedAt">) => post<FavoriteEntry>("/api/favorites", entry),

  // DELETE returns 204 with no body, so this can't go through the json<T> helper (which
  // always calls res.json()) - same reasoning as render()'s custom not-ok handling above.
  removeFavorite: (key: string) =>
    fetch(`/api/favorites/${encodeURIComponent(key)}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) {
        return r.json().then((body) => {
          throw new Error(body.error ?? `Request failed: ${r.status}`);
        });
      }
    }),
};
```

- [ ] **Step 3: Write `client/src/favorites/FavoritesContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";

type FavoritesContextValue = {
  favorites: FavoriteEntry[];
  isFavorite: (key: string) => boolean;
  // `build` is only invoked when `key` is not currently a favorite (adding); toggling off
  // an existing favorite just removes it by key, no snapshot needed.
  toggle: (key: string, build: () => Omit<FavoriteEntry, "savedAt">) => Promise<void>;
  error: string | null;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFavorites()
      .then(setFavorites)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const isFavorite = useCallback((key: string) => favorites.some((f) => f.key === key), [favorites]);

  const toggle = useCallback(
    async (key: string, build: () => Omit<FavoriteEntry, "savedAt">) => {
      setError(null);
      const wasFavorite = favorites.some((f) => f.key === key);
      const previous = favorites;

      if (wasFavorite) {
        setFavorites(favorites.filter((f) => f.key !== key));
        try {
          await api.removeFavorite(key);
        } catch (e) {
          setFavorites(previous);
          setError(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      const entry = build();
      // Optimistic add with a placeholder savedAt, replaced once the server responds with
      // the real one.
      setFavorites([...favorites, { ...entry, savedAt: new Date().toISOString() }]);
      try {
        const saved = await api.addFavorite(entry);
        setFavorites((current) => current.map((f) => (f.key === saved.key ? saved : f)));
      } catch (e) {
        setFavorites(previous);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [favorites],
  );

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggle, error }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Wrap the app in `client/src/main.tsx`**

Current content:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Replace with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FavoritesProvider } from "./favorites/FavoritesContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FavoritesProvider>
      <App />
    </FavoritesProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify in the browser**

With the server from Task 2 running (`npm run dev -w server`) and the client dev server running (`npm run dev -w client`, or `npm run dev` from the repo root to start both), open the printed client URL (typically `http://localhost:5173`) in a browser, open devtools' Network tab, and reload. Confirm a `GET /api/favorites` request fires once and returns `200 []` (assuming Task 2's curl test left it empty) - this proves `FavoritesProvider` is mounted and fetching. Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/client.ts client/src/favorites/FavoritesContext.tsx client/src/main.tsx
git commit -m "Add favorites API client methods and FavoritesContext"
```

---

### Task 4: `FavoriteStar` component + wire into `EntityDetailView`

**Files:**
- Create: `client/src/components/FavoriteStar.tsx`
- Modify: `client/src/views/EntityDetailView.tsx:1-6` (imports) and `:84-93` (header)

**Interfaces:**
- Consumes: `useFavorites()` (Task 3).
- Produces: `<FavoriteStar entryKey={string} buildEntry={() => Omit<FavoriteEntry, "savedAt">} size?={number} />`, exported from `client/src/components/FavoriteStar.tsx`. Tasks 5 and 6 both render this component the same way.

- [ ] **Step 1: Write `client/src/components/FavoriteStar.tsx`**

```tsx
import type { FavoriteEntry } from "@citizens-helper/shared/src/types";
import { useFavorites } from "../favorites/FavoritesContext";

type Props = {
  entryKey: string;
  // Computed only on click, not on every render, since assembling a snapshot touches
  // fields the caller may not otherwise need to read.
  buildEntry: () => Omit<FavoriteEntry, "savedAt">;
  size?: number;
};

// Star toggle used on the Entity Browser grid/detail page and on citizen/scenery
// cards/editors. Always renders a filled or outline star; never a loading state -
// FavoritesContext.toggle is optimistic, so there's nothing to wait on here.
export function FavoriteStar({ entryKey, buildEntry, size = 16 }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(entryKey);

  return (
    <button
      onClick={(e) => {
        // Every place this renders sits inside a larger clickable card/row - without
        // this, clicking the star would also fire the card's own onClick (select/navigate).
        e.stopPropagation();
        toggle(entryKey, buildEntry);
      }}
      title={active ? "Remove from favorites" : "Add to favorites"}
      style={{
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: size,
        color: active ? "#f0ad4e" : "#bbb",
        lineHeight: 1,
        padding: 2,
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
```

- [ ] **Step 2: Wire it into `EntityDetailView`'s header**

Current imports (lines 1-6):

```tsx
import { useEffect, useMemo, useState } from "react";
import type { EntityDetail, EntityKind } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { LiveViewer } from "../three/LiveViewer";
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { EntityDetail, EntityKind } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { LiveViewer } from "../three/LiveViewer";
```

Current header block (lines 84-93):

```tsx
      <h2 style={{ marginBottom: 2 }}>
        {entity.name ?? <span style={{ opacity: 0.6 }}>(unnamed)</span>}{" "}
        <span style={{ fontSize: 14, opacity: 0.6, fontWeight: "normal" }}>
          {kind} #{entity.id}
        </span>
      </h2>
```

Replace with:

```tsx
      <h2 style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
        {entity.name ?? <span style={{ opacity: 0.6 }}>(unnamed)</span>}{" "}
        <span style={{ fontSize: 14, opacity: 0.6, fontWeight: "normal" }}>
          {kind} #{entity.id}
        </span>
        <FavoriteStar
          entryKey={`${kind}:${entity.id}`}
          buildEntry={() => {
            const animations: Record<string, string | number> = {};
            if (entity.standingAnimation != null && entity.standingAnimation >= 0) {
              animations.standing = entity.standingAnimation;
            }
            if (entity.walkingAnimation != null && entity.walkingAnimation >= 0) {
              animations.walking = entity.walkingAnimation;
            }
            return {
              key: `${kind}:${entity.id}`,
              kind,
              sourceLabel: `${kind} #${entity.id}`,
              name: entity.name,
              modelIds: entity.modelIds,
              recolorFind: entity.recolorFind,
              recolorReplace: entity.recolorReplace,
              animations,
            };
          }}
        />
      </h2>
```

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

With both dev servers running, navigate to `/#/entities/npc`, click into any NPC with a name (e.g. search "man"), and on its detail page click the outline star next to the heading. It should immediately fill in gold (★). Reload the page - it should still show filled. Run `curl -s http://localhost:5175/api/favorites` and confirm one entry with `"kind":"npc"` and non-empty `animations` if that NPC has a standing/walking animation. Click the star again to un-favorite; confirm it goes back to `☆` and the curl call returns `[]`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FavoriteStar.tsx client/src/views/EntityDetailView.tsx
git commit -m "Add FavoriteStar component and wire it into the entity detail page"
```

---

### Task 5: Wire `FavoriteStar` into citizen/scenery views

**Files:**
- Modify: `client/src/views/RegionDetailView.tsx` (imports; `CitizenCard`; scenery card block)
- Modify: `client/src/views/CitizenEditorView.tsx` (imports; header)
- Modify: `client/src/views/SceneryEditorView.tsx` (imports; header)

**Interfaces:**
- Consumes: `FavoriteStar` (Task 4).
- Produces: nothing new consumed by later tasks - this is a leaf UI wiring task.

- [ ] **Step 1: `RegionDetailView.tsx` imports**

Current (lines 1-6):

```tsx
import { useCallback, useEffect, useState } from "react";
import type { CitizenInfo, CitizenRegionFile, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { RegionOverview } from "../components/RegionOverview";
import { NearbyNpcRoster } from "../components/NearbyNpcRoster";
```

Replace with:

```tsx
import { useCallback, useEffect, useState } from "react";
import type { CitizenInfo, CitizenRegionFile, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { RegionOverview } from "../components/RegionOverview";
import { NearbyNpcRoster } from "../components/NearbyNpcRoster";
```

- [ ] **Step 2: Add a `regionId` prop to `CitizenCard` and render the star**

Current `CitizenCard` (lines 25-61):

```tsx
function CitizenCard({
  citizen,
  onClick,
  onDuplicate,
  onDelete,
  busy,
}: {
  citizen: CitizenInfo;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
      <div onClick={onClick} style={{ cursor: "pointer" }}>
        <ModelThumb
          modelIds={citizen.modelIds}
          recolorFind={citizen.modelRecolorFind ?? []}
          recolorReplace={citizen.modelRecolorReplace ?? []}
          size={128}
          alt={citizen.name}
        />
        <div style={{ fontSize: 13, marginTop: 6 }}>{citizen.name}</div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>{citizen.entityType.replace("Citizen", "")}</div>
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
        <button onClick={onDuplicate} disabled={busy} style={{ fontSize: 11, padding: "2px 6px" }}>
          Duplicate
        </button>
        <button onClick={onDelete} disabled={busy} style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
```

Replace with:

```tsx
function CitizenCard({
  citizen,
  regionId,
  onClick,
  onDuplicate,
  onDelete,
  busy,
}: {
  citizen: CitizenInfo;
  regionId: number;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <FavoriteStar
          entryKey={`citizen:${regionId}:${citizen.uuid}`}
          buildEntry={() => {
            const animations: Record<string, string | number> = {};
            if (citizen.idleAnimation) animations.idle = citizen.idleAnimation;
            if (citizen.moveAnimation) animations.move = citizen.moveAnimation;
            return {
              key: `citizen:${regionId}:${citizen.uuid}`,
              kind: "citizen",
              sourceLabel: `region ${regionId}`,
              name: citizen.name,
              modelIds: citizen.modelIds,
              recolorFind: citizen.modelRecolorFind ?? [],
              recolorReplace: citizen.modelRecolorReplace ?? [],
              animations,
            };
          }}
        />
      </div>
      <div onClick={onClick} style={{ cursor: "pointer" }}>
        <ModelThumb
          modelIds={citizen.modelIds}
          recolorFind={citizen.modelRecolorFind ?? []}
          recolorReplace={citizen.modelRecolorReplace ?? []}
          size={128}
          alt={citizen.name}
        />
        <div style={{ fontSize: 13, marginTop: 6 }}>{citizen.name}</div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>{citizen.entityType.replace("Citizen", "")}</div>
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
        <button onClick={onDuplicate} disabled={busy} style={{ fontSize: 11, padding: "2px 6px" }}>
          Duplicate
        </button>
        <button onClick={onDelete} disabled={busy} style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pass `regionId` at the call site**

Current (inside the roster view, around line 180-193):

```tsx
        {region.citizenRoster.map((c) => (
          <CitizenCard
            key={c.uuid}
            citizen={c}
            busy={busy}
            onClick={() => onSelectCitizen(c.uuid)}
            onDuplicate={() => mutate(() => api.duplicateCitizen(regionId, c.uuid))}
            onDelete={() => {
              if (confirm(`Delete "${c.name}"? This rewrites RegionData/${regionId}.json.`)) {
                mutate(() => api.deleteCitizen(regionId, c.uuid));
              }
            }}
          />
        ))}
```

Replace with:

```tsx
        {region.citizenRoster.map((c) => (
          <CitizenCard
            key={c.uuid}
            citizen={c}
            regionId={regionId}
            busy={busy}
            onClick={() => onSelectCitizen(c.uuid)}
            onDuplicate={() => mutate(() => api.duplicateCitizen(regionId, c.uuid))}
            onDelete={() => {
              if (confirm(`Delete "${c.name}"? This rewrites RegionData/${regionId}.json.`)) {
                mutate(() => api.deleteCitizen(regionId, c.uuid));
              }
            }}
          />
        ))}
```

- [ ] **Step 4: Add a star to the inline scenery card block**

Current (lines 197-232):

```tsx
      <h3>Scenery ({region.sceneryRoster.length})</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {region.sceneryRoster.map((s) => (
          <div key={s.uuid} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
            <ModelThumb
              modelIds={s.modelIds}
              recolorFind={s.modelRecolorFind ?? []}
              recolorReplace={s.modelRecolorReplace ?? []}
              size={128}
              alt={`scenery ${s.uuid}`}
            />
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>[{s.modelIds.join(", ")}]</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              ({s.worldLocation.x}, {s.worldLocation.y})
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
              <button
                onClick={() => onSelectSceneryIn(regionId, s.uuid)}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px" }}
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete this scenery entry? This rewrites RegionData/${regionId}.json.`)) {
                    mutate(() => api.deleteScenery(regionId, s.uuid));
                  }
                }}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
```

Replace with:

```tsx
      <h3>Scenery ({region.sceneryRoster.length})</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {region.sceneryRoster.map((s) => (
          <div key={s.uuid} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, width: 144, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <FavoriteStar
                entryKey={`scenery:${regionId}:${s.uuid}`}
                buildEntry={() => ({
                  key: `scenery:${regionId}:${s.uuid}`,
                  kind: "scenery",
                  sourceLabel: `region ${regionId}`,
                  name: null,
                  modelIds: s.modelIds,
                  recolorFind: s.modelRecolorFind ?? [],
                  recolorReplace: s.modelRecolorReplace ?? [],
                  animations: s.idleAnimation ? { idle: s.idleAnimation } : {},
                })}
              />
            </div>
            <ModelThumb
              modelIds={s.modelIds}
              recolorFind={s.modelRecolorFind ?? []}
              recolorReplace={s.modelRecolorReplace ?? []}
              size={128}
              alt={`scenery ${s.uuid}`}
            />
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>[{s.modelIds.join(", ")}]</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              ({s.worldLocation.x}, {s.worldLocation.y})
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
              <button
                onClick={() => onSelectSceneryIn(regionId, s.uuid)}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px" }}
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete this scenery entry? This rewrites RegionData/${regionId}.json.`)) {
                    mutate(() => api.deleteScenery(regionId, s.uuid));
                  }
                }}
                disabled={busy}
                style={{ fontSize: 11, padding: "2px 6px", color: "crimson" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
```

- [ ] **Step 5: `CitizenEditorView.tsx` imports**

Current (lines 1-16):

```tsx
import { useEffect, useMemo, useState } from "react";
import type {
  CitizenInfo,
  CitizenRegionFile,
  EntityType,
  ScriptFile,
  WorldPoint,
} from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS, animationSequenceId } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AnimationControls, type PreviewAnim } from "../components/AnimationControls";
import { AppearancePicker } from "../components/AppearancePicker";
import { ScriptEditor, appendWaypoint, routePoints } from "../components/ScriptEditor";
import { RegionTileMap, type MapMarker, type WanderBox } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer, type ClipInfo } from "../three/LiveViewer";
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type {
  CitizenInfo,
  CitizenRegionFile,
  EntityType,
  ScriptFile,
  WorldPoint,
} from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS, animationSequenceId } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AnimationControls, type PreviewAnim } from "../components/AnimationControls";
import { AppearancePicker } from "../components/AppearancePicker";
import { FavoriteStar } from "../components/FavoriteStar";
import { ScriptEditor, appendWaypoint, routePoints } from "../components/ScriptEditor";
import { RegionTileMap, type MapMarker, type WanderBox } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer, type ClipInfo } from "../three/LiveViewer";
```

- [ ] **Step 6: Add the star to `CitizenEditorView`'s header**

Current (lines 312-316):

```tsx
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2 style={{ marginBottom: 2 }}>{isCreate ? "New citizen" : draft.name}</h2>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>Region {regionId}</p>
```

Replace with:

```tsx
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2 style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
        {isCreate ? "New citizen" : draft.name}
        {/* Not favoritable while still a draft (isCreate) - there's no uuid yet to key on
            until the first save. */}
        {!isCreate && uuid && (
          <FavoriteStar
            entryKey={`citizen:${regionId}:${uuid}`}
            buildEntry={() => {
              const animations: Record<string, string | number> = {};
              if (draft.idleAnimation) animations.idle = draft.idleAnimation;
              if (draft.moveAnimation) animations.move = draft.moveAnimation;
              return {
                key: `citizen:${regionId}:${uuid}`,
                kind: "citizen",
                sourceLabel: `region ${regionId}`,
                name: draft.name,
                modelIds: draft.modelIds,
                recolorFind: draft.modelRecolorFind ?? [],
                recolorReplace: draft.modelRecolorReplace ?? [],
                animations,
              };
            }}
          />
        )}
      </h2>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>Region {regionId}</p>
```

- [ ] **Step 7: `SceneryEditorView.tsx` imports**

Current (lines 1-8):

```tsx
import { useEffect, useMemo, useState } from "react";
import type { CitizenRegionFile, SceneryInfo, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AppearancePicker } from "../components/AppearancePicker";
import { RegionTileMap, type MapMarker } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer } from "../three/LiveViewer";
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { CitizenRegionFile, SceneryInfo, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AppearancePicker } from "../components/AppearancePicker";
import { FavoriteStar } from "../components/FavoriteStar";
import { RegionTileMap, type MapMarker } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer } from "../three/LiveViewer";
```

- [ ] **Step 8: Add the star to `SceneryEditorView`'s header**

Current (lines 207-211):

```tsx
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2 style={{ marginBottom: 2 }}>{isCreate ? "New scenery" : `Scenery [${draft.modelIds.join(", ")}]`}</h2>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>Region {regionId}</p>
```

Replace with:

```tsx
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2 style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
        {isCreate ? "New scenery" : `Scenery [${draft.modelIds.join(", ")}]`}
        {!isCreate && uuid && (
          <FavoriteStar
            entryKey={`scenery:${regionId}:${uuid}`}
            buildEntry={() => ({
              key: `scenery:${regionId}:${uuid}`,
              kind: "scenery",
              sourceLabel: `region ${regionId}`,
              name: null,
              modelIds: draft.modelIds,
              recolorFind: draft.modelRecolorFind ?? [],
              recolorReplace: draft.modelRecolorReplace ?? [],
              animations: draft.idleAnimation ? { idle: draft.idleAnimation } : {},
            })}
          />
        )}
      </h2>
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>Region {regionId}</p>
```

- [ ] **Step 9: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Verify in the browser**

Open any region with at least one citizen and one scenery entry (e.g. region `12086`, the Monk from an earlier session). In roster view, click the star on the Monk's citizen card - it fills gold. Click the star on a scenery card - same. Open the Monk in the citizen editor (star should already show filled there too, since it's the same `entryKey`) and toggle it off from there - confirm the roster card's star also updates after navigating back (it re-reads from the shared `FavoritesContext`, not local state). Run `curl -s http://localhost:5175/api/favorites` and confirm the `citizen:12086:<uuid>` / `scenery:12086:<uuid>` entries look right, including `animations.idle` matching what's in `RegionData/12086.json`.

- [ ] **Step 11: Commit**

```bash
git add client/src/views/RegionDetailView.tsx client/src/views/CitizenEditorView.tsx client/src/views/SceneryEditorView.tsx
git commit -m "Wire FavoriteStar into citizen and scenery views"
```

---

### Task 6: `EntityPreviewGrid` + inline preview and favorites-only filter in `EntityBrowserView`

**Files:**
- Create: `client/src/components/EntityPreviewGrid.tsx`
- Modify: `client/src/views/EntityBrowserView.tsx` (full rewrite)

**Interfaces:**
- Consumes: `api.render` (existing), `LiveViewer` (existing), `FavoriteStar` (Task 4), `useFavorites` (Task 3).
- Produces: `EntityPreviewGrid<T extends PreviewItem>` and the `PreviewItem` type, exported from `client/src/components/EntityPreviewGrid.tsx`. Task 7's `FavoritesView` renders through this same component.

- [ ] **Step 1: Write `client/src/components/EntityPreviewGrid.tsx`**

```tsx
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
```

- [ ] **Step 2: Rewrite `client/src/views/EntityBrowserView.tsx`**

Replace the entire file with:

```tsx
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
  useEffect(() => {
    setOffset(0);
    setRawQuery("");
    setQuery("");
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

      {error && !favoritesOnly && <p style={{ color: "crimson" }}>{error}</p>}
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
                  border: selected ? "2px solid #4a90e2" : "1px solid #ddd",
                  borderRadius: 6,
                  padding: 8,
                  width: 132,
                  background: "white",
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
```

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Navigate to `/#/entities/npc`. Confirm the grid + pagination look the same as before. Click a card - confirm the side panel shows a live, orbit-able 3D preview (drag to rotate) instead of immediately navigating. Click "Open full details →" - confirm it navigates to `/#/entities/npc/<id>`, matching the old click-to-navigate behavior. Go back, click a card's star - confirm it fills in without also triggering selection-navigation weirdness (i.e. the card doesn't also flip its preview-selection oddly - clicking the star should only toggle the star). Check the "★ Favorites only" checkbox - confirm the list narrows to just your favorited NPC(s) and pagination controls disappear; type in the search box - confirm it further narrows by name. Repeat quickly for the Objects and Items tabs.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/EntityPreviewGrid.tsx client/src/views/EntityBrowserView.tsx
git commit -m "Add inline live-preview panel and favorites-only filter to the Entity Browser"
```

---

### Task 7: `FavoritesView` page + nav link

**Files:**
- Create: `client/src/components/CopyButton.tsx` (extracted from `EntityDetailView.tsx`)
- Modify: `client/src/views/EntityDetailView.tsx` (remove local `CopyButton`, import the shared one)
- Create: `client/src/views/FavoritesView.tsx`
- Modify: `client/src/App.tsx` (nav link, route)

**Interfaces:**
- Consumes: `EntityPreviewGrid`/`PreviewItem` (Task 6), `useFavorites` (Task 3), `FavoriteEntry` (Task 1).
- Produces: `FavoritesView` component taking `{ onOpen: (entry: FavoriteEntry) => void }`, exported from `client/src/views/FavoritesView.tsx`. Nothing later depends on it - this is the final task.

- [ ] **Step 1: Extract `CopyButton` into its own file**

Write `client/src/components/CopyButton.tsx`:

```tsx
import { useState } from "react";

type Props = { text: string; label: string };

export function CopyButton({ text, label }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{ fontSize: 12, padding: "3px 8px" }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
```

- [ ] **Step 2: Remove the local definition from `EntityDetailView.tsx` and import the shared one**

Current imports (as of Task 4's changes, lines 1-7):

```tsx
import { useEffect, useMemo, useState } from "react";
import type { EntityDetail, EntityKind } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { LiveViewer } from "../three/LiveViewer";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{ fontSize: 12, padding: "3px 8px" }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { EntityDetail, EntityKind } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { CopyButton } from "../components/CopyButton";
import { LiveViewer } from "../three/LiveViewer";
```

- [ ] **Step 3: Write `client/src/views/FavoritesView.tsx`**

```tsx
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
  const { favorites, toggle } = useFavorites();
  const [kindFilter, setKindFilter] = useState<FavoriteKind | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = favorites
    .filter((f) => kindFilter === "all" || f.kind === kindFilter)
    .filter((f) => !query || (f.name ?? "").toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Favorites</h2>
      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
        Snapshots of models/recolors/animations you've starred, across NPCs, objects, items, citizens and
        scenery. These do not update if the original source changes - remove and re-favorite to refresh one.
      </p>

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
              background: k.kind === kindFilter ? "#4a90e2" : "#eee",
              color: k.kind === kindFilter ? "white" : "inherit",
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
                border: selected ? "2px solid #4a90e2" : "1px solid #ddd",
                borderRadius: 6,
                padding: 8,
                width: 140,
                background: "white",
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
                {entry.name ?? <span style={{ opacity: 0.5 }}>(unnamed)</span>}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                {entry.kind} &middot; {entry.sourceLabel}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <CopyButton text={entry.modelIds.join(",")} label="Copy ids" />
                <button
                  onClick={() => toggle(entry.key, () => entry)}
                  style={{ fontSize: 12, padding: "3px 8px", color: "crimson" }}
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
```

- [ ] **Step 4: Add the route and nav link in `client/src/App.tsx`**

Current `Chrome` (lines 49-64):

```tsx
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Link to="/" style={{ fontSize: 20, fontWeight: "bold", color: "inherit", textDecoration: "none" }}>
          Citizens Plugin Helper Tool
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/entities/npc">Entity Browser</Link>
          <Link to="/kits">Kit Browser</Link>
        </div>
      </div>
      {children}
    </div>
  );
}
```

Replace with:

```tsx
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Link to="/" style={{ fontSize: 20, fontWeight: "bold", color: "inherit", textDecoration: "none" }}>
          Citizens Plugin Helper Tool
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/entities/npc">Entity Browser</Link>
          <Link to="/kits">Kit Browser</Link>
          <Link to="/favorites">Favorites</Link>
        </div>
      </div>
      {children}
    </div>
  );
}
```

Add the import (top of file, alongside the other view imports):

Current (lines 1-10):

```tsx
import { HashRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { WorldPoint } from "@citizens-helper/shared/src/types";
import { RegionListView } from "./views/RegionListView";
import { RegionDetailView } from "./views/RegionDetailView";
import { CitizenEditorView } from "./views/CitizenEditorView";
import { SceneryEditorView } from "./views/SceneryEditorView";
import { EntityBrowserView } from "./views/EntityBrowserView";
import { EntityDetailView } from "./views/EntityDetailView";
import { ModelBrowser } from "./components/ModelBrowser";
import { regionIdFromTile } from "./components/gameMap";
```

Replace with:

```tsx
import { HashRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { WorldPoint } from "@citizens-helper/shared/src/types";
import { RegionListView } from "./views/RegionListView";
import { RegionDetailView } from "./views/RegionDetailView";
import { CitizenEditorView } from "./views/CitizenEditorView";
import { SceneryEditorView } from "./views/SceneryEditorView";
import { EntityBrowserView } from "./views/EntityBrowserView";
import { EntityDetailView } from "./views/EntityDetailView";
import { FavoritesView } from "./views/FavoritesView";
import { ModelBrowser } from "./components/ModelBrowser";
import { regionIdFromTile } from "./components/gameMap";
```

Add a `FavoritesRoute` wrapper (after `EntityDetailRoute`, before `export default function App()` - i.e. after line 177):

```tsx
function FavoritesRoute() {
  const navigate = useNavigate();
  return (
    <Chrome>
      <FavoritesView
        onOpen={(entry) => {
          const parts = entry.key.split(":");
          if (entry.kind === "npc" || entry.kind === "object" || entry.kind === "item") {
            navigate(`/entities/${entry.kind}/${parts[1]}`);
          } else if (entry.kind === "citizen") {
            navigate(`/regions/${parts[1]}/citizens/${parts[2]}`);
          } else {
            navigate(`/regions/${parts[1]}/scenery/${parts[2]}`);
          }
        }}
      />
    </Chrome>
  );
}
```

Register the route. Current `<Routes>` block (lines 182-198):

```tsx
      <Routes>
        <Route path="/" element={<RegionListRoute />} />
        <Route path="/regions/:regionId" element={<RegionDetailRoute />} />
        <Route path="/regions/:regionId/citizens/:uuid" element={<CitizenEditorRoute />} />
        <Route path="/regions/:regionId/scenery/:uuid" element={<SceneryEditorRoute />} />
        <Route path="/entities/:kind" element={<EntityBrowserRoute />} />
        <Route path="/entities/:kind/:id" element={<EntityDetailRoute />} />
        <Route
          path="/kits"
          element={
            <Chrome>
              <KitBrowserRoute />
            </Chrome>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
```

Replace with:

```tsx
      <Routes>
        <Route path="/" element={<RegionListRoute />} />
        <Route path="/regions/:regionId" element={<RegionDetailRoute />} />
        <Route path="/regions/:regionId/citizens/:uuid" element={<CitizenEditorRoute />} />
        <Route path="/regions/:regionId/scenery/:uuid" element={<SceneryEditorRoute />} />
        <Route path="/entities/:kind" element={<EntityBrowserRoute />} />
        <Route path="/entities/:kind/:id" element={<EntityDetailRoute />} />
        <Route path="/favorites" element={<FavoritesRoute />} />
        <Route
          path="/kits"
          element={
            <Chrome>
              <KitBrowserRoute />
            </Chrome>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
```

- [ ] **Step 5: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Verify in the browser**

With favorites from earlier tasks still present (or add a couple fresh ones - one NPC, one citizen), click "Favorites" in the top nav. Confirm all of them show up with correct thumbnails, kind labels, and source labels. Click the "NPCs" filter chip - confirm only the NPC favorite(s) show. Type part of a name into the search box - confirm it narrows further. Click a card, confirm the live preview panel updates. Click "Open →" on an NPC favorite - confirm it navigates to that NPC's entity detail page. Go back to Favorites, click "Open →" on a citizen favorite - confirm it navigates to that citizen's editor. Click "Copy ids" on any card - confirm the clipboard receives a comma-joined id list (paste somewhere to check) and the button briefly shows "Copied!". Click "Remove" on one - confirm it disappears from the Favorites page and its star (checked via the Entity Browser or the citizen roster) is now unfilled.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/CopyButton.tsx client/src/views/EntityDetailView.tsx client/src/views/FavoritesView.tsx client/src/App.tsx
git commit -m "Add cross-kind Favorites page with search and a nav link"
```

---

## Self-review notes

- **Spec coverage:** unified `FavoriteEntry`/`FavoriteKind` (Task 1); server storage + routes (Task 2); client API + context (Task 3); star on NPC/object/item detail (Task 4); star on citizen/scenery card/editor views (Task 5); inline click-to-preview panel + favorites-only filter on the Entity Browser (Task 6); cross-kind Favorites page with kind filter, text search, copy, remove (Task 7). All five spec sections have a task.
- **Known, intentional gap (not a bug):** favoriting directly from an Entity Browser grid card (Task 6) captures empty `animations`, since `EntitySummary` (list rows) doesn't carry `standingAnimation`/`walkingAnimation` - only the full `EntityDetail` fetched by the detail page (Task 4) does. Fetching full detail for all 60 visible rows just to enable this would reintroduce the per-row-fetch cost the existing codebase's comments already call out as unacceptable. Favoriting from the detail page captures animations; favoriting from the grid does not. This is called out in the code comment at Task 6 Step 2.
- **Type consistency check:** `FavoriteStar`'s `buildEntry` returns `Omit<FavoriteEntry, "savedAt">` everywhere it's used (Tasks 4, 5, 6); `FavoritesContext.toggle`'s `build` parameter and `favoritesRepo.addFavorite`'s parameter both match that same type (Tasks 2, 3). `EntityPreviewGrid`'s `PreviewItem` (`key`/`name`/`modelIds`/`recolorFind`/`recolorReplace`) is satisfied by both `BrowserItem` (Task 6) and `FavoriteEntry` (Task 7) without either needing a cast.
