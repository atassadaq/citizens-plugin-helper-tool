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

function RegionListRoute() {
  const navigate = useNavigate();
  // Owns its own full-viewport layout (map mode is a fullscreen HUD), so it renders
  // outside the padded Chrome wrapper every other view uses.
  return (
    <RegionListView
      onSelectRegion={(regionId) => navigate(`/regions/${regionId}`)}
      onOpenModelBrowser={() => navigate("/entities/npc")}
    />
  );
}

function RegionDetailRoute() {
  const navigate = useNavigate();
  const regionId = useNumericParam("regionId");
  if (regionId == null) return <Navigate to="/" replace />;

  return (
    <Chrome>
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
        onCreateCitizenAt={(point) =>
          navigate(`/regions/${regionIdFromTile(point.x, point.y)}/citizens/new${tileQuery(point)}`)
        }
        onCreateSceneryAt={(point) =>
          navigate(`/regions/${regionIdFromTile(point.x, point.y)}/scenery/new${tileQuery(point)}`)
        }
      />
    </Chrome>
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
    <Chrome>
      <CitizenEditorView
        regionId={regionId}
        // The literal path segment "new" is the create mode, so a half-filled new citizen
        // has a real URL like any other view instead of living in transient state.
        uuid={uuid === "new" ? null : uuid}
        initialPoint={initialPoint}
        cloneFromNpcId={cloneFromNpcId}
        onBack={() => navigate(`/regions/${regionId}`)}
        onCreated={(newUuid) => navigate(`/regions/${regionId}/citizens/${newUuid}`, { replace: true })}
      />
    </Chrome>
  );
}

function SceneryEditorRoute() {
  const navigate = useNavigate();
  const regionId = useNumericParam("regionId");
  const { uuid } = useParams();
  const initialPoint = usePointFromQuery();
  if (regionId == null || !uuid) return <Navigate to="/" replace />;

  return (
    <Chrome>
      <SceneryEditorView
        regionId={regionId}
        uuid={uuid === "new" ? null : uuid}
        initialPoint={initialPoint}
        onBack={() => navigate(`/regions/${regionId}`)}
        onCreated={(newUuid) => navigate(`/regions/${regionId}/scenery/${newUuid}`, { replace: true })}
      />
    </Chrome>
  );
}

function EntityBrowserRoute() {
  const navigate = useNavigate();
  const { kind } = useParams();
  if (kind !== "npc" && kind !== "object" && kind !== "item") {
    return <Navigate to="/entities/npc" replace />;
  }

  return (
    <Chrome>
      <EntityBrowserView kind={kind} onSelect={(id) => navigate(`/entities/${kind}/${id}`)} />
    </Chrome>
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
    <Chrome>
      <EntityDetailView kind={kind} id={id} onBack={() => navigate(`/entities/${kind}`)} />
    </Chrome>
  );
}

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
    </HashRouter>
  );
}

function KitBrowserRoute() {
  const navigate = useNavigate();
  return <ModelBrowser onBack={() => navigate("/")} />;
}
