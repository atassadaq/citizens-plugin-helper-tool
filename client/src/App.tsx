import { Suspense, lazy, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { WorldPoint } from "@citizens-helper/shared/src/types";
import { regionIdFromTile } from "./components/gameMap";
import { regionLabel } from "./data/regionNames";
import { AppShell, PageLoading, type Crumb } from "./ui/AppShell";
import { Icon } from "./ui/Icon";

// Route-level code splitting: three.js (editors, browsers) and Leaflet (maps) are large, and
// each view only pays for what it renders. Named exports are adapted to lazy()'s default.
const WorldMapView = lazy(() => import("./views/RegionListView").then((m) => ({ default: m.WorldMapView })));
const RegionTableView = lazy(() => import("./views/RegionListView").then((m) => ({ default: m.RegionTableView })));
const RegionDetailView = lazy(() => import("./views/RegionDetailView").then((m) => ({ default: m.RegionDetailView })));
const CitizenEditorView = lazy(() => import("./views/CitizenEditorView").then((m) => ({ default: m.CitizenEditorView })));
const SceneryEditorView = lazy(() => import("./views/SceneryEditorView").then((m) => ({ default: m.SceneryEditorView })));
const EntityBrowserView = lazy(() => import("./views/EntityBrowserView").then((m) => ({ default: m.EntityBrowserView })));
const EntityDetailView = lazy(() => import("./views/EntityDetailView").then((m) => ({ default: m.EntityDetailView })));
const FavoritesView = lazy(() => import("./views/FavoritesView").then((m) => ({ default: m.FavoritesView })));
const ScriptsView = lazy(() => import("./views/ScriptsView").then((m) => ({ default: m.ScriptsView })));
const ModelBrowser = lazy(() => import("./components/ModelBrowser").then((m) => ({ default: m.ModelBrowser })));

// Hash routing rather than browser history: this is served by `vite dev` with no SPA
// rewrite rule configured, so a deep link like /entities/npc/385 would 404 on reload under
// history routing. It also keeps the URL shape close to runemonk's entity viewer, which is
// what makes an entity link shareable/reloadable at all.

// Route params arrive as strings; anything non-numeric is a malformed URL rather than a
// state the UI should try to render.
function useNumericParam(name: string): number | null {
  const params = useParams();
  const raw = params[name];
  const value = Number(raw);
  return raw != null && Number.isInteger(value) ? value : null;
}

// Creating an entity from the map's right-click menu carries the chosen tile through the
// URL rather than router state, so the half-filled editor survives a reload like every
// other view in the app.
function usePointFromQuery(): WorldPoint | null {
  const [params] = useSearchParams();
  const x = Number(params.get("x"));
  const y = Number(params.get("y"));
  const plane = Number(params.get("plane") ?? 0);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !params.get("x")) return null;
  return { x, y, plane: Number.isInteger(plane) ? plane : 0 };
}

function useNumericQuery(name: string): number | null {
  const [params] = useSearchParams();
  const raw = params.get(name);
  const value = Number(raw);
  return raw != null && Number.isInteger(value) ? value : null;
}

function tileQuery(point: WorldPoint): string {
  return `?x=${point.x}&y=${point.y}&plane=${point.plane}`;
}

function Page({ crumbs, actions, full, children }: { crumbs?: Crumb[]; actions?: ReactNode; full?: boolean; children: ReactNode }) {
  return (
    <AppShell crumbs={crumbs} actions={actions} full={full}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </AppShell>
  );
}

const regionCrumbs = (regionId: number): Crumb[] => [
  { label: "Regions", to: "/regions" },
  { label: regionLabel(regionId), to: `/regions/${regionId}` },
];

function WorldMapRoute() {
  const navigate = useNavigate();
  return (
    <Page full>
      <WorldMapView onSelectRegion={(regionId) => navigate(`/regions/${regionId}`)} />
    </Page>
  );
}

function RegionTableRoute() {
  const navigate = useNavigate();
  return (
    <Page crumbs={[{ label: "Regions" }]}>
      <RegionTableView onSelectRegion={(regionId) => navigate(`/regions/${regionId}`)} />
    </Page>
  );
}

function RegionDetailRoute() {
  const navigate = useNavigate();
  const regionId = useNumericParam("regionId");
  if (regionId == null) return <Navigate to="/" replace />;

  return (
    <Page
      full
      crumbs={regionCrumbs(regionId)}
      actions={
        <button className="btn-ghost" onClick={() => navigate("/")} title="Back to the world map">
          <Icon name="map" /> World map
        </button>
      }
    >
      <RegionDetailView
        regionId={regionId}
        onBack={() => navigate("/")}
        onSelectCitizen={(uuid) => navigate(`/regions/${regionId}/citizens/${uuid}`)}
        onCreateCitizen={() => navigate(`/regions/${regionId}/citizens/new`)}
        // The map draws neighbouring regions too, so editing routes to the region whose
        // file the entity actually lives in, not the one being viewed.
        onSelectCitizenIn={(rid, uuid) => navigate(`/regions/${rid}/citizens/${uuid}`)}
        onSelectSceneryIn={(rid, uuid) => navigate(`/regions/${rid}/scenery/${uuid}`)}
        onCloneNpcToCitizen={(npcId) => navigate(`/regions/${regionId}/citizens/new?npc=${npcId}`)}
        onCreateCitizenAt={(point) => navigate(`/regions/${regionIdFromTile(point.x, point.y)}/citizens/new${tileQuery(point)}`)}
        onCreateSceneryAt={(point) => navigate(`/regions/${regionIdFromTile(point.x, point.y)}/scenery/new${tileQuery(point)}`)}
      />
    </Page>
  );
}

function CitizenEditorRoute() {
  const navigate = useNavigate();
  const regionId = useNumericParam("regionId");
  const { uuid } = useParams();
  const initialPoint = usePointFromQuery();
  const cloneFromNpcId = useNumericQuery("npc");
  if (regionId == null || !uuid) return <Navigate to="/" replace />;

  return (
    <Page crumbs={[...regionCrumbs(regionId), { label: uuid === "new" ? "New citizen" : "Citizen" }]}>
      <CitizenEditorView
        // Remount on navigation between citizens so no draft state leaks across.
        key={`${regionId}/${uuid}`}
        regionId={regionId}
        // The literal path segment "new" is the create mode, so a half-filled new citizen
        // has a real URL like any other view instead of living in transient state.
        uuid={uuid === "new" ? null : uuid}
        initialPoint={initialPoint}
        cloneFromNpcId={cloneFromNpcId}
        onBack={() => navigate(`/regions/${regionId}`)}
        onCreated={(newUuid) => navigate(`/regions/${regionId}/citizens/${newUuid}`, { replace: true })}
      />
    </Page>
  );
}

function SceneryEditorRoute() {
  const navigate = useNavigate();
  const regionId = useNumericParam("regionId");
  const { uuid } = useParams();
  const initialPoint = usePointFromQuery();
  if (regionId == null || !uuid) return <Navigate to="/" replace />;

  return (
    <Page crumbs={[...regionCrumbs(regionId), { label: uuid === "new" ? "New scenery" : "Scenery" }]}>
      <SceneryEditorView
        key={`${regionId}/${uuid}`}
        regionId={regionId}
        uuid={uuid === "new" ? null : uuid}
        initialPoint={initialPoint}
        onBack={() => navigate(`/regions/${regionId}`)}
        onCreated={(newUuid) => navigate(`/regions/${regionId}/scenery/${newUuid}`, { replace: true })}
      />
    </Page>
  );
}

function ScriptsRoute() {
  const navigate = useNavigate();
  const { name } = useParams();
  return (
    <Page crumbs={name ? [{ label: "Scripts", to: "/scripts" }, { label: name }] : [{ label: "Scripts" }]}>
      <ScriptsView
        selected={name ?? null}
        onSelect={(n) => navigate(n ? `/scripts/${n}` : "/scripts")}
        onOpenCitizen={(regionId, uuid) => navigate(`/regions/${regionId}/citizens/${uuid}`)}
      />
    </Page>
  );
}

const KIND_LABEL = { npc: "NPCs", object: "Objects", item: "Items" } as const;

function EntityBrowserRoute() {
  const navigate = useNavigate();
  const { kind } = useParams();
  if (kind !== "npc" && kind !== "object" && kind !== "item") {
    return <Navigate to="/entities/npc" replace />;
  }

  return (
    <Page crumbs={[{ label: "Entity browser", to: "/entities/npc" }, { label: KIND_LABEL[kind] }]}>
      <EntityBrowserView kind={kind} onSelect={(id) => navigate(`/entities/${kind}/${id}`)} />
    </Page>
  );
}

function EntityDetailRoute() {
  const navigate = useNavigate();
  const { kind } = useParams();
  const id = useNumericParam("id");
  if ((kind !== "npc" && kind !== "object" && kind !== "item") || id == null) {
    return <Navigate to="/entities/npc" replace />;
  }

  return (
    <Page crumbs={[{ label: "Entity browser", to: "/entities/npc" }, { label: KIND_LABEL[kind], to: `/entities/${kind}` }, { label: `#${id}` }]}>
      <EntityDetailView kind={kind} id={id} onBack={() => navigate(`/entities/${kind}`)} />
    </Page>
  );
}

function FavoritesRoute() {
  const navigate = useNavigate();
  return (
    <Page crumbs={[{ label: "Favorites" }]}>
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
    </Page>
  );
}

function KitBrowserRoute() {
  const navigate = useNavigate();
  return (
    <Page crumbs={[{ label: "Kit browser" }]}>
      <ModelBrowser onBack={() => navigate("/")} />
    </Page>
  );
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<WorldMapRoute />} />
        <Route path="/regions" element={<RegionTableRoute />} />
        <Route path="/regions/:regionId" element={<RegionDetailRoute />} />
        <Route path="/regions/:regionId/citizens/:uuid" element={<CitizenEditorRoute />} />
        <Route path="/regions/:regionId/scenery/:uuid" element={<SceneryEditorRoute />} />
        <Route path="/scripts" element={<ScriptsRoute />} />
        <Route path="/scripts/:name" element={<ScriptsRoute />} />
        <Route path="/entities/:kind" element={<EntityBrowserRoute />} />
        <Route path="/entities/:kind/:id" element={<EntityDetailRoute />} />
        <Route path="/favorites" element={<FavoritesRoute />} />
        <Route path="/kits" element={<KitBrowserRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
