import { useEffect, useMemo, useState } from "react";
import type { CitizenRegionFile, SceneryInfo, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AppearancePicker } from "../components/AppearancePicker";
import { FavoriteStar } from "../components/FavoriteStar";
import { RegionTileMap, type MapMarker } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer } from "../three/LiveViewer";

type Props = {
  regionId: number;
  // null means create mode - nothing exists on disk yet.
  uuid: string | null;
  // Tile to start at, when created from the map's right-click menu.
  initialPoint?: WorldPoint | null;
  onBack: () => void;
  onCreated: (uuid: string) => void;
};

// Scenery is placed by rotation in the same JAU units citizens use, but unlike citizens it
// is almost always axis-aligned - these four are what the existing data uses.
const ORIENTATIONS: { label: string; value: number }[] = [
  { label: "South (0)", value: 0 },
  { label: "West (512)", value: 512 },
  { label: "North (1024)", value: 1024 },
  { label: "East (1536)", value: 1536 },
];

function newScenery(regionId: number, initialPoint?: WorldPoint | null): SceneryInfo {
  const origin = regionOrigin(regionId);
  return {
    uuid: "",
    regionId,
    entityType: "Scenery",
    worldLocation: initialPoint ?? { x: origin.x + 32, y: origin.y + 32, plane: 0 },
    modelIds: [],
    modelRecolorFind: [],
    modelRecolorReplace: [],
    baseOrientation: 0,
    idleAnimation: null,
  };
}

// scale/translate are float[] on the Java side and passed through as-is; the plugin negates
// axes internally at render time, so these are shown raw rather than "corrected" here.
type Triplet = [number, number, number];

function TripletInput({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: Triplet | null | undefined;
  fallback: number;
  onChange: (next: Triplet | null) => void;
}) {
  const active = value ?? null;
  const shown: Triplet = active ?? [fallback, fallback, fallback];
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={active != null}
          onChange={(e) => onChange(e.target.checked ? [...shown] : null)}
        />
        {label}
        <span style={{ opacity: 0.6, fontSize: 11 }}>{active == null ? "(omitted from the file)" : ""}</span>
      </label>
      {active != null && (
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {(["x", "y", "z"] as const).map((axis, i) => (
            <label key={axis} style={{ fontSize: 11, flex: 1 }}>
              {axis}
              <input
                type="number"
                step="0.1"
                value={active[i]}
                onChange={(e) => {
                  const next: Triplet = [...active];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
                style={{ display: "block", width: "100%", padding: 4 }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SceneryEditorView({ regionId, uuid, initialPoint, onBack, onCreated }: Props) {
  const isCreate = uuid === null;
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [draft, setDraft] = useState<SceneryInfo | null>(null);
  const [gltfText, setGltfText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [plane, setPlane] = useState(initialPoint?.plane ?? 0);

  useEffect(() => {
    setLoadError(null);
    api
      .getRegion(regionId)
      .then((r) => {
        setRegion(r);
        if (isCreate) {
          setDraft(newScenery(regionId, initialPoint));
          return;
        }
        const scenery = r.sceneryRoster.find((s) => s.uuid === uuid) ?? null;
        if (!scenery) {
          setLoadError(`Scenery ${uuid} not found in region ${regionId}`);
          return;
        }
        setDraft(scenery);
        setPlane(scenery.worldLocation.plane);
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, uuid, isCreate]);

  const recolorMismatch =
    !!draft && (draft.modelRecolorFind?.length ?? 0) !== (draft.modelRecolorReplace?.length ?? 0);

  useEffect(() => {
    if (!draft || recolorMismatch || draft.modelIds.length === 0) {
      setGltfText(null);
      return;
    }
    const handle = setTimeout(() => {
      api
        .render({
          modelIds: draft.modelIds,
          recolorFind: draft.modelRecolorFind ?? [],
          recolorReplace: draft.modelRecolorReplace ?? [],
        })
        .then((gltf) => {
          setGltfText(gltf);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(e.message));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.modelIds, draft?.modelRecolorFind, draft?.modelRecolorReplace, recolorMismatch]);

  const otherMarkers = useMemo<MapMarker[]>(() => {
    const citizens = (region?.citizenRoster ?? []).map<MapMarker>((c) => ({
      id: `citizen:${c.uuid}`,
      point: c.worldLocation,
      label: c.name,
      color: "#4a90e2",
      faded: true,
    }));
    const scenery = (region?.sceneryRoster ?? [])
      .filter((s) => s.uuid !== uuid)
      .map<MapMarker>((s) => ({
        id: `scenery:${s.uuid}`,
        point: s.worldLocation,
        label: `[${s.modelIds.join(",")}]`,
        color: "#5cb85c",
        faded: true,
      }));
    return [...citizens, ...scenery];
  }, [region, uuid]);

  if (loadError) {
    return (
      <div>
        <button onClick={onBack}>&larr; Back to region {regionId}</button>
        <p style={{ color: "var(--danger)" }}>{loadError}</p>
      </div>
    );
  }
  if (!region || !draft) return <p>Loading scenery...</p>;

  const patch = (fields: Partial<SceneryInfo>) => setDraft({ ...draft, ...fields });
  const canSave = draft.modelIds.length > 0 && !recolorMismatch;

  async function handleSave() {
    if (!draft) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      if (isCreate) {
        const updated = await api.createScenery(regionId, draft);
        const created = updated.sceneryRoster[updated.sceneryRoster.length - 1];
        setSaveState("saved");
        onCreated(created.uuid);
      } else {
        await api.saveScenery(regionId, uuid!, draft);
        setSaveState("saved");
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState("error");
    }
  }

  return (
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2 style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
        {isCreate ? "New scenery" : `Scenery [${draft.modelIds.join(", ")}]`}
        {!isCreate && uuid && (
          <FavoriteStar
            entryKey={`scenery:${regionId}:${uuid}`}
            buildEntry={() => {
              const animations: Record<string, string | number> = {};
              if (draft.idleAnimation) animations.idle = draft.idleAnimation;
              return {
                key: `scenery:${regionId}:${uuid}`,
                kind: "scenery",
                sourceLabel: `region ${regionId}`,
                name: null,
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

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 340 }}>
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Appearance</h3>
          <AppearancePicker
            value={{
              modelIds: draft.modelIds,
              recolorFind: draft.modelRecolorFind ?? [],
              recolorReplace: draft.modelRecolorReplace ?? [],
            }}
            onChange={(next) =>
              patch({
                modelIds: next.modelIds,
                modelRecolorFind: next.recolorFind,
                modelRecolorReplace: next.recolorReplace,
              })
            }
          />
          {recolorMismatch && (
            <p style={{ color: "var(--danger)", fontSize: 12 }}>Recolor find/replace arrays must be the same length.</p>
          )}

          <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
            <label style={{ fontSize: 12, flex: 1 }}>
              Orientation
              <select
                value={draft.baseOrientation ?? 0}
                onChange={(e) => patch({ baseOrientation: Number(e.target.value) })}
                style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
              >
                {ORIENTATIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, flex: 1 }}>
              Idle animation
              <select
                value={draft.idleAnimation ?? ""}
                onChange={(e) => patch({ idleAnimation: e.target.value || null })}
                style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
              >
                <option value="">(none)</option>
                {ANIMATION_IDS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <TripletInput
            label="Scale"
            value={draft.scale}
            fallback={1}
            onChange={(scale) => patch({ scale })}
          />
          <TripletInput
            label="Translate"
            value={draft.translate}
            fallback={0}
            onChange={(translate) => patch({ translate })}
          />
        </div>

        <div style={{ flex: "1 1 380px", minWidth: 340 }}>
          <div style={{ width: 340, height: 300, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {gltfText ? (
              <LiveViewer gltfText={gltfText} width={340} height={300} />
            ) : (
              <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12, opacity: 0.6 }}>
                {draft.modelIds.length === 0 ? "Pick a model to preview" : "Rendering..."}
              </div>
            )}
          </div>
          {previewError && <p style={{ color: "var(--danger)", fontSize: 12 }}>{previewError}</p>}

          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
            <strong style={{ fontSize: 13 }}>Placement</strong>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              ({draft.worldLocation.x}, {draft.worldLocation.y}, z{draft.worldLocation.plane})
            </span>
            <button onClick={() => setPlane(Math.max(0, plane - 1))} disabled={plane === 0} style={{ fontSize: 11 }}>
              Z-
            </button>
            <span style={{ fontSize: 11 }}>plane {plane}</span>
            <button onClick={() => setPlane(Math.min(3, plane + 1))} disabled={plane === 3} style={{ fontSize: 11 }}>
              Z+
            </button>
          </div>

          <RegionTileMap
            regionId={regionId}
            plane={plane}
            position={draft.worldLocation}
            onPositionChange={(point) => patch({ worldLocation: point })}
            markers={otherMarkers}
            height={380}
          />
          <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Click a tile or drag the red marker to set this scenery's position.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <button onClick={handleSave} disabled={!canSave || saveState === "saving"} style={{ padding: "6px 16px" }}>
          {saveState === "saving" ? "Saving..." : isCreate ? "Create scenery" : "Save"}
        </button>
        {saveState === "saved" && <span style={{ marginLeft: 8, color: "var(--success)" }}>Saved.</span>}
        {!canSave && (
          <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
            {draft.modelIds.length === 0 ? "Pick at least one model to save." : "Fix the errors above to save."}
          </span>
        )}
        {saveError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{saveError}</p>}
      </div>
    </div>
  );
}
