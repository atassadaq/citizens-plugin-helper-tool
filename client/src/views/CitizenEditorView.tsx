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

type Props = {
  regionId: number;
  // null means create mode - nothing exists on disk yet.
  uuid: string | null;
  // Tile to start at, when created from the map's right-click menu.
  initialPoint?: WorldPoint | null;
  // Game NPC to seed the appearance from, when created via "Clone to citizen".
  cloneFromNpcId?: number | null;
  onBack: () => void;
  onCreated: (uuid: string) => void;
};

const CITIZEN_TYPES: EntityType[] = ["StationaryCitizen", "WanderingCitizen", "ScriptedCitizen"];

// baseOrientation is a raw angle; these are the values CardinalDirection.java maps to.
const ORIENTATIONS: { label: string; value: number }[] = [
  { label: "South", value: 0 },
  { label: "SouthWest", value: 256 },
  { label: "West", value: 512 },
  { label: "NorthWest", value: 768 },
  { label: "North", value: 1024 },
  { label: "East", value: 1536 },
  { label: "SouthEast", value: 1792 },
];

function newCitizen(regionId: number, initialPoint?: WorldPoint | null): CitizenInfo {
  // Centre of the region is a defensible default: it's guaranteed inside the file's own
  // region, so a citizen created without touching the map still loads correctly.
  const origin = regionOrigin(regionId);
  const centre: WorldPoint = { x: origin.x + 32, y: origin.y + 32, plane: 0 };
  return {
    uuid: "",
    regionId,
    entityType: "StationaryCitizen",
    name: "New citizen",
    examineText: "",
    remarks: [],
    worldLocation: initialPoint ?? centre,
    modelIds: [],
    modelRecolorFind: [],
    modelRecolorReplace: [],
    baseOrientation: 0,
    idleAnimation: "HumanIdle",
    moveAnimation: "HumanWalk",
  };
}

function suggestScriptName(citizen: CitizenInfo, regionId: number): string {
  const slug = (citizen.name || "citizen").replace(/[^A-Za-z0-9]/g, "");
  return `${slug.charAt(0).toLowerCase()}${slug.slice(1)}${regionId}`;
}

export function CitizenEditorView({
  regionId,
  uuid,
  initialPoint,
  cloneFromNpcId,
  onBack,
  onCreated,
}: Props) {
  const isCreate = uuid === null;
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [draft, setDraft] = useState<CitizenInfo | null>(null);
  const [gltfText, setGltfText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Script state is separate from the citizen: the citizen only stores a name, and the
  // routine itself lives in Scripts/<name>.json, shared with any other citizen using it.
  const [scriptActions, setScriptActions] = useState<ScriptFile["actions"]>([]);
  const [scriptUsedBy, setScriptUsedBy] = useState<number>(0);
  // Route drawing and box drawing both claim map clicks, so they're one exclusive tool
  // rather than two independent toggles.
  const [mapTool, setMapTool] = useState<"position" | "route" | "wanderBox">("position");
  const [plane, setPlane] = useState(0);

  // Animation preview. Idle is the default because it's what a citizen shows almost all
  // of the time in game.
  const [previewAnim, setPreviewAnim] = useState<PreviewAnim>("idle");
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);

  useEffect(() => {
    setLoadError(null);
    api
      .getRegion(regionId)
      .then((r) => {
        setRegion(r);
        if (isCreate) {
          setDraft(newCitizen(regionId, initialPoint));
          setPlane(initialPoint?.plane ?? 0);
          return;
        }
        const citizen = r.citizenRoster.find((c) => c.uuid === uuid) ?? null;
        if (!citizen) {
          setLoadError(`Citizen ${uuid} not found in region ${regionId}`);
          return;
        }
        setDraft(citizen);
        setPlane(citizen.worldLocation.plane);
      })
      .catch((e) => setLoadError(e.message));
  }, [regionId, uuid, isCreate]);

  // Load the referenced script whenever the name changes, so switching a citizen onto an
  // existing routine shows that routine rather than an empty editor.
  const startScript = draft?.startScript ?? null;
  useEffect(() => {
    if (!startScript) {
      setScriptActions([]);
      setScriptUsedBy(0);
      return;
    }
    let cancelled = false;
    api
      .getScript(startScript)
      .then((s) => {
        if (!cancelled) setScriptActions(s.actions);
      })
      .catch(() => {
        // A name that doesn't exist yet is the normal create case, not an error.
        if (!cancelled) setScriptActions([]);
      });
    api
      .listScripts()
      .then((all) => {
        if (cancelled) return;
        const match = all.find((s) => s.name === startScript);
        setScriptUsedBy(match?.usedBy.filter((u) => u.uuid !== uuid).length ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [startScript, uuid]);

  const recolorMismatch =
    !!draft && (draft.modelRecolorFind?.length ?? 0) !== (draft.modelRecolorReplace?.length ?? 0);

  // Seeding from a game NPC. Applied as a patch after the blank draft exists rather than
  // being folded into newCitizen(), so it can't race the region load and so it's a no-op on
  // an already-saved citizen.
  useEffect(() => {
    if (!isCreate || cloneFromNpcId == null) return;
    let cancelled = false;
    api
      .getEntity("npc", cloneFromNpcId)
      .then((npc) => {
        if (cancelled || !npc) return;
        const body = npc.variants.find((v) => v.label === "Body") ?? npc.variants[0];
        if (!body) return;
        setDraft((prev) =>
          prev
            ? {
                ...prev,
                name: npc.name ?? prev.name,
                modelIds: body.modelIds,
                modelRecolorFind: npc.recolorFind,
                modelRecolorReplace: npc.recolorReplace,
              }
            : prev,
        );
      })
      .catch(() => {
        // A bad npc id just leaves the blank draft in place; the appearance picker is
        // right there.
      });
    return () => {
      cancelled = true;
    };
  }, [isCreate, cloneFromNpcId, region]);

  // The name the citizen stores ("HumanIdle") maps to a cache sequence id, which is what
  // the renderer bakes frames from.
  const previewAnimName =
    previewAnim === "idle"
      ? (draft?.idleAnimation ?? null)
      : previewAnim === "move"
        ? (draft?.moveAnimation ?? null)
        : null;
  const previewAnimationId = animationSequenceId(previewAnimName);

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
          animationId: previewAnimationId,
        })
        .then((gltf) => {
          setGltfText(gltf);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(e.message));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.modelIds, draft?.modelRecolorFind, draft?.modelRecolorReplace, recolorMismatch, previewAnimationId]);

  // A new clip means the old frame index refers to nothing, and a paused viewer would
  // otherwise show the previous animation's held pose.
  useEffect(() => {
    setClip(null);
    setFrameIndex(null);
    setPaused(false);
  }, [previewAnimationId]);

  // Other citizens in the region, drawn faded for context so you can place someone
  // relative to who's already there.
  const otherMarkers = useMemo<MapMarker[]>(
    () =>
      (region?.citizenRoster ?? [])
        .filter((c) => c.uuid !== uuid)
        .map((c) => ({ id: c.uuid, point: c.worldLocation, label: c.name, color: "#4a90e2", faded: true })),
    [region, uuid],
  );

  if (loadError) {
    return (
      <div>
        <button onClick={onBack}>&larr; Back to region {regionId}</button>
        <p style={{ color: "crimson" }}>{loadError}</p>
      </div>
    );
  }
  if (!region || !draft) return <p>Loading citizen...</p>;

  const patch = (fields: Partial<CitizenInfo>) => setDraft({ ...draft, ...fields });

  const isWandering = draft.entityType === "WanderingCitizen";
  const wanderBox: WanderBox | null =
    isWandering && draft.wanderBoxBL && draft.wanderBoxTR
      ? { bl: draft.wanderBoxBL, tr: draft.wanderBoxTR }
      : null;
  // The box plane is pinned to the citizen's own plane rather than whichever plane the map
  // happens to be showing: a wander box on a different plane to its citizen is accepted by
  // the Java loader and then silently never used.
  const setWanderBox = (box: WanderBox) => {
    const p = draft.worldLocation.plane;
    patch({ wanderBoxBL: { ...box.bl, plane: p }, wanderBoxTR: { ...box.tr, plane: p } });
  };

  // Util.calculateBoundingBox measures span, not tile count: corners one tile apart give
  // width 1. It throws when width and height are both <= 1, so a 2x2-tile box is invalid
  // but a 3x2 one is fine.
  const boxWidth = wanderBox ? Math.abs(wanderBox.tr.x - wanderBox.bl.x) : 0;
  const boxHeight = wanderBox ? Math.abs(wanderBox.tr.y - wanderBox.bl.y) : 0;
  const boxTooSmall = !!wanderBox && boxWidth <= 1 && boxHeight <= 1;
  const positionOutsideBox =
    !!wanderBox &&
    (draft.worldLocation.x < wanderBox.bl.x ||
      draft.worldLocation.x > wanderBox.tr.x ||
      draft.worldLocation.y < wanderBox.bl.y ||
      draft.worldLocation.y > wanderBox.tr.y);

  const canSave =
    draft.modelIds.length > 0 && !recolorMismatch && draft.name.trim().length > 0 && !boxTooSmall;

  async function handleSave() {
    if (!draft) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      // The script is written first: if it fails, the citizen isn't left pointing at a
      // routine that doesn't exist (ScriptLoader returns null and the citizen silently
      // never moves, which is very hard to diagnose from the plugin side).
      if (draft.entityType === "ScriptedCitizen" && draft.startScript) {
        await api.saveScript(draft.startScript, { actions: scriptActions });
      }
      if (isCreate) {
        const updated = await api.createCitizen(regionId, draft);
        const created = updated.citizenRoster[updated.citizenRoster.length - 1];
        setSaveState("saved");
        onCreated(created.uuid);
      } else {
        await api.saveCitizen(regionId, uuid!, draft);
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

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Left: identity, appearance, behaviour */}
        <div style={{ flex: "1 1 420px", minWidth: 340 }}>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Name
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
            />
          </label>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            Examine text
            <input
              value={draft.examineText}
              onChange={(e) => patch({ examineText: e.target.value })}
              style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 12, flex: 1 }}>
              Type
              <select
                value={draft.entityType}
                onChange={(e) => {
                  const entityType = e.target.value as EntityType;
                  patch({
                    entityType,
                    // Seeded so switching to these types produces something valid rather
                    // than a save that fails validation.
                    wanderBoxBL:
                      entityType === "WanderingCitizen"
                        ? (draft.wanderBoxBL ?? {
                            x: draft.worldLocation.x - 2,
                            y: draft.worldLocation.y - 2,
                            plane: draft.worldLocation.plane,
                          })
                        : null,
                    wanderBoxTR:
                      entityType === "WanderingCitizen"
                        ? (draft.wanderBoxTR ?? {
                            x: draft.worldLocation.x + 2,
                            y: draft.worldLocation.y + 2,
                            plane: draft.worldLocation.plane,
                          })
                        : null,
                    startScript:
                      entityType === "ScriptedCitizen"
                        ? (draft.startScript ?? suggestScriptName(draft, regionId))
                        : null,
                  });
                  setMapTool("position");
                }}
                style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
              >
                {CITIZEN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, flex: 1 }}>
              Facing
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
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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
            <label style={{ fontSize: 12, flex: 1 }}>
              Move animation
              <select
                value={draft.moveAnimation ?? ""}
                onChange={(e) => patch({ moveAnimation: e.target.value || null })}
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
            <p style={{ color: "crimson", fontSize: 12 }}>Recolor find/replace arrays must be the same length.</p>
          )}

          {draft.entityType === "ScriptedCitizen" && (
            <div style={{ marginTop: 14, border: "1px solid #e2e2e2", borderRadius: 6, padding: 10 }}>
              <label style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                Script name
                <input
                  value={draft.startScript ?? ""}
                  onChange={(e) => patch({ startScript: e.target.value })}
                  style={{ display: "block", width: "100%", padding: 5, marginTop: 2 }}
                />
              </label>
              {scriptUsedBy > 0 && (
                <p style={{ fontSize: 12, color: "#8a6d00", background: "#fff8e1", padding: 6, borderRadius: 4 }}>
                  {scriptUsedBy} other citizen{scriptUsedBy === 1 ? "" : "s"} also use this script - editing the
                  routine changes their behaviour too.
                </p>
              )}
              <ScriptEditor
                actions={scriptActions}
                onChange={setScriptActions}
                routeMode={mapTool === "route"}
                onToggleRouteMode={() => setMapTool((t) => (t === "route" ? "position" : "route"))}
              />
            </div>
          )}
        </div>

        {/* Right: preview + map */}
        <div style={{ flex: "1 1 380px", minWidth: 340 }}>
          <div style={{ width: 340, height: 300, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            {gltfText ? (
              <LiveViewer
                gltfText={gltfText}
                width={340}
                height={300}
                paused={paused}
                timeScale={timeScale}
                seekTime={frameIndex != null && clip ? (clip.frameTimes[frameIndex] ?? null) : null}
                onClipLoaded={setClip}
              />
            ) : (
              <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12, opacity: 0.6 }}>
                {draft.modelIds.length === 0 ? "Pick an appearance to preview" : "Rendering..."}
              </div>
            )}
          </div>
          {previewError && <p style={{ color: "crimson", fontSize: 12 }}>{previewError}</p>}

          <AnimationControls
            previewAnim={previewAnim}
            onPreviewAnimChange={setPreviewAnim}
            idleAnimation={draft.idleAnimation ?? null}
            moveAnimation={draft.moveAnimation ?? null}
            clip={clip}
            paused={paused}
            onPausedChange={setPaused}
            timeScale={timeScale}
            onTimeScaleChange={setTimeScale}
            frameIndex={frameIndex}
            onFrameIndexChange={setFrameIndex}
          />

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

          {isWandering && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => setMapTool((t) => (t === "wanderBox" ? "position" : "wanderBox"))}
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  background: mapTool === "wanderBox" ? "#f0ad4e" : "#eee",
                  color: mapTool === "wanderBox" ? "white" : "inherit",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {mapTool === "wanderBox" ? "Drag on the map to draw (on)" : "Draw wander box"}
              </button>
              {wanderBox && (
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  ({wanderBox.bl.x}, {wanderBox.bl.y}) to ({wanderBox.tr.x}, {wanderBox.tr.y}) &mdash;{" "}
                  {boxWidth + 1}&times;{boxHeight + 1} tiles
                </span>
              )}
            </div>
          )}

          <RegionTileMap
            regionId={regionId}
            plane={plane}
            position={draft.worldLocation}
            onPositionChange={(point) => patch({ worldLocation: point })}
            wanderBox={wanderBox}
            onWanderBoxChange={isWandering ? setWanderBox : undefined}
            route={draft.entityType === "ScriptedCitizen" ? routePoints(scriptActions) : []}
            onRouteAppend={(point) => setScriptActions((prev) => appendWaypoint(prev, point))}
            clickMode={mapTool}
            markers={otherMarkers}
            height={380}
          />

          <p style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {mapTool === "route"
              ? "Click tiles to append WalkTo waypoints, in order."
              : mapTool === "wanderBox"
                ? "Drag across the map to draw the box, or drag either orange corner to resize it."
                : "Click a tile or drag the red marker to set this citizen's position."}
          </p>

          {isWandering && wanderBox && (
            <div style={{ fontSize: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() =>
                  setWanderBox({
                    bl: { ...draft.worldLocation, x: draft.worldLocation.x - 3, y: draft.worldLocation.y - 3 },
                    tr: { ...draft.worldLocation, x: draft.worldLocation.x + 3, y: draft.worldLocation.y + 3 },
                  })
                }
                style={{ fontSize: 11 }}
              >
                Recentre box on position
              </button>
              {boxTooSmall && (
                <span style={{ color: "crimson" }}>
                  Box must be larger than 1&times;1 tiles - the plugin throws on load otherwise.
                </span>
              )}
              {!boxTooSmall && positionOutsideBox && (
                <span style={{ color: "#8a6d00" }}>
                  Position is outside the box. The plugin spawns wanderers at a random tile inside the box, so
                  this position is ignored.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <button onClick={handleSave} disabled={!canSave || saveState === "saving"} style={{ padding: "6px 16px" }}>
          {saveState === "saving" ? "Saving..." : isCreate ? "Create citizen" : "Save"}
        </button>
        {saveState === "saved" && <span style={{ marginLeft: 8, color: "green" }}>Saved.</span>}
        {!canSave && (
          <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
            {draft.modelIds.length === 0 ? "Pick at least one model to save." : "Fix the errors above to save."}
          </span>
        )}
        {saveError && <p style={{ color: "crimson", fontSize: 13 }}>{saveError}</p>}
      </div>
    </div>
  );
}
