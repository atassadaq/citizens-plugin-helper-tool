# Favorites + inline model viewer — design

## Purpose

Let the user favorite NPCs, objects, items (from the cache-derived Entity Browser), and
citizens/scenery (from RegionData), snapshotting each favorite's models/recolors/animations for
later reuse. Add a "favorites only" filter to the model-search UI, a dedicated Favorites page, and
an inline live-3D preview panel in the Entity Browser grid (replacing click-to-navigate with
click-to-preview).

## Non-goals (v1)

- No "apply favorite to citizen" / clone-from-favorite shortcut. Reuse is copy-model-ids-and-paste,
  the same pattern already used everywhere else in this tool (`EntityDetailView`'s `CopyButton`,
  `ModelBrowser`'s "Copy model ids").
- No "refresh snapshot" action. Un-favorite and re-favorite if the source has changed and you want
  an updated copy.
- No favorites for `RegionData`'s scripts (`ScriptFile`) - out of scope, wasn't asked for.

## Data model

Add to `shared/src/types.ts`:

```ts
export type FavoriteKind = "npc" | "object" | "item" | "citizen" | "scenery";

export type FavoriteEntry = {
  // Identity + dedup key. "npc:1234" / "object:5" / "item:9" for cache entities,
  // "citizen:<regionId>:<uuid>" / "scenery:<regionId>:<uuid>" for RegionData entities.
  key: string;
  kind: FavoriteKind;
  // Display-only breadcrumb back to where this was favorited from, e.g. "npc #1234" or
  // "region 12086". Not used for lookups - the favorite is a frozen snapshot, the source
  // may since have changed or been deleted.
  sourceLabel: string;
  name: string | null;
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
  // Loose label->value bag rather than a discriminated union per kind: npc snapshots carry
  // numeric cache sequence ids (from EntityDetail.standingAnimation/walkingAnimation),
  // citizen/scenery snapshots carry AnimationID name strings (from idleAnimation/
  // moveAnimation). Object/item have no animation fields in the cache, so this is `{}` for them.
  animations: Record<string, string | number>;
  savedAt: string; // ISO timestamp, set server-side on create
};
```

One unified type across all five kinds, not one type per kind - the Favorites page and the
favorites-only filter both need to merge/search across kinds, so five near-identical shapes would
just mean writing the merge back afterward.

## Server

New files, following the existing `scriptRepo.ts` / `routes/scripts.ts` pattern exactly (thin
Express routes over a repo module that does plain `fs` read/write, no DB):

- **`server/src/favoritesRepo.ts`**
  - `listFavorites(): Promise<FavoriteEntry[]>` - reads `server/data/favorites.json`; treats a
    missing file as `[]` (not a startup requirement, unlike `RegionData`/cache paths in
    `config.ts` - the tool works fine with zero favorites).
  - `addFavorite(entry: Omit<FavoriteEntry, "key" | "savedAt"> & { key: string }): Promise<FavoriteEntry>`
    - computes `savedAt`, upserts by `key` (adding an already-present key overwrites, so a stale
      client doesn't produce duplicate entries), writes the whole file back.
  - `removeFavorite(key: string): Promise<void>` - filters out by key, writes whole file back.
    No-op (not an error) if the key isn't present.
- **`server/src/routes/favorites.ts`**
  - `GET /api/favorites` → `FavoriteEntry[]`
  - `POST /api/favorites` (body: entry without `savedAt`) → created `FavoriteEntry`
  - `DELETE /api/favorites/:key` (key URL-encoded, since citizen/scenery keys contain `:`) → `204`
- Register `favoritesRouter` in `server/src/index.ts` next to the other routers.
- `server/data/` added to root `.gitignore`, same treatment as `.env` - this is machine-local
  personal data, not something to commit.

No changes to `entityCatalog.ts`, `regionRepo.ts`, or the existing `searchEntities` function - the
favorites-only filter is client-side (see below), and favoriting reads data the client already has
in hand at the point of the star click.

## Client

**`client/src/favorites/FavoritesContext.tsx`** - `FavoritesProvider` wraps `<App>` in `main.tsx`.
Fetches the full list once on mount via `api.listFavorites()`. Exposes:
- `favorites: FavoriteEntry[]`
- `isFavorite(key: string): boolean`
- `toggle(key: string, build: () => Omit<FavoriteEntry, "savedAt">): Promise<void>` - `build`
  must include `key` (matching `favoritesRepo.addFavorite`'s signature below). Optimistically flips
  local state immediately, fires the POST/DELETE, and rolls the local state back if the request
  fails (surfacing the error via the same inline-`error`-text pattern used throughout the app - no
  new error UI vocabulary).

**`client/src/components/FavoriteStar.tsx`** - `☆`/`★` button. Takes `entryKey: string` and a
`buildEntry: () => Omit<FavoriteEntry, "savedAt">` thunk (computed only on click, not per render,
since building a snapshot touches fields the caller may not otherwise need; must set `key` to the
same value as `entryKey`). Reads `isFavorite`/`toggle` from `FavoritesContext`. Placed on:
- `EntityBrowserView` cards and `EntityDetailView`'s header
- `RegionDetailView`'s `CitizenCard` and the inline scenery card block
- `CitizenEditorView` / `SceneryEditorView` headers

Key construction per kind:
- npc/object/item: `` `${kind}:${entity.id}` ``
- citizen/scenery: `` `${kind}:${regionId}:${uuid}` ``

**`client/src/components/EntityPreviewGrid.tsx`** (new, extracted from `EntityBrowserView`) -
generic grid of `{key, name, modelIds, recolorFind, recolorReplace}[]`. Renders `ModelThumb` cards
in a wrapping flex grid (as today) plus a sticky side panel. Clicking a card sets it "selected"
(local state) and the panel renders that card's model live via `LiveViewer`, with an "Open full
details →" action that performs the navigation `EntityBrowserView.onSelect` currently fires
immediately on click. Only one `LiveViewer` canvas is ever mounted at a time (the panel's), keeping
the existing thumbnail-grid-vs-live-viewer WebGL-context-limit design intact.

Both `EntityBrowserView` and the new `FavoritesView` render through `EntityPreviewGrid`, so the
click-to-preview/sticky-panel behavior is written once.

**`EntityBrowserView` changes** - add a "★ Favorites only" checkbox next to the existing search
input, scoped to the active kind tab (npc/object/item). When checked:
- Skip the `api.searchEntities` call entirely.
- Render `favorites.filter(f => f.kind === kind && matchesQuery(f.name, query))` through
  `EntityPreviewGrid` instead - a favorite already carries every field the grid needs, so there's
  nothing to fetch.
- Pagination controls hide (favorites lists are expected to be small; add pagination back later if
  that stops being true).

**New `client/src/views/FavoritesView.tsx`**, routed at `/favorites`, linked from `Chrome`'s nav
next to "Entity Browser"/"Kit Browser" in `App.tsx`. Kind-filter chips (All / NPC / Object / Item /
Citizen / Scenery) + a text search over `name`, rendered through `EntityPreviewGrid`. Each card
additionally gets:
- A "Copy model ids" button (`CopyButton`, same component `EntityDetailView` already uses).
- A "Remove favorite" button, calling `toggle` with that entry's key.

## Error handling

- Corrupt/missing `favorites.json` → treated as `[]` on read, not a startup failure.
- Failed favorite/unfavorite request → optimistic UI change is rolled back, error text shown
  inline (existing pattern, e.g. `EntityBrowserView`'s `{error && <p style={{ color: "crimson" }}>}`).
- `DELETE` for a key that no longer exists (e.g. two tabs open, already removed in one) → 204,
  not an error - deletion is idempotent.

## Testing

No test suite or lint config exists in this repo (per its `CLAUDE.md`), so verification is manual:

1. `npm run dev`, favorite one entry of each kind (npc, object, item, citizen, scenery).
2. Reload the page - stars still show filled, `server/data/favorites.json` has all five entries.
3. Toggle "★ Favorites only" on each Entity Browser tab - only that kind's favorite(s) show.
4. Open `/favorites` - all five show, kind-filter chips narrow correctly, text search matches by
   name, "Copy model ids" copies the right ids, "Remove favorite" removes and un-stars the source.
5. Click a card in the Entity Browser grid - side panel shows a live 3D preview, "Open full
   details →" navigates to the existing detail page.
6. `npx tsc --noEmit` clean in both `client/` and `server/`.
