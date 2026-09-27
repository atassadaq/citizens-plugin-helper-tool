import { useEffect, useMemo, useRef, useState } from "react";
import type { CitizenInfo, CitizenRegionFile, EntityType, ScriptFile, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS, animationSequenceId } from "@citizens-helper/shared/src/animationIds";
import { api } from "../api/client";
import { AnimationControls, type PreviewAnim } from "../components/AnimationControls";
import { AppearancePicker } from "../components/AppearancePicker";
import { FavoriteStar } from "../components/FavoriteStar";
import { ScriptEditor, appendWaypoint, routePoints, scriptProblems } from "../components/ScriptEditor";
import { RegionTileMap, type MapMarker, type WanderBox } from "../components/RegionTileMap";
import { regionOrigin } from "../components/gameMap";
import { LiveViewer, type ClipInfo } from "../three/LiveViewer";
import { Icon } from "../ui/Icon";
import { PageLoading } from "../ui/AppShell";
import { useToast } from "../ui/Toasts";
import { useElementWidth, useSaveShortcut, useUnsavedChangesWarning } from "../ui/hooks";

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

const CITIZEN_TYPES: { type: EntityType; label: string; blurb: string }[] = [
  { type: "StationaryCitizen", label: "Stationary", blurb: "Stands in one spot, idling and making remarks." },
  { type: "WanderingCitizen", label: "Wandering", blurb: "Strolls to random tiles inside a box you draw." },
  { type: "ScriptedCitizen", label: "Scripted", blurb: "Follows a looping routine: walk, animate, talk." },
];

// baseOrientation is a raw JAU angle; these are the values CardinalDirection.java maps to.
const ORIENTATIONS: { label: string; value: number }[] = [
  { label: "South", value: 0 },
  { label: "South-west", value: 256 },
  { label: "West", value: 512 },
  { label: "North-west", value: 768 },
  { label: "North", value: 1024 },
  { label: "North-east", value: 1280 },
  { label: "East", value: 1536 },
  { label: "South-east", value: 1792 },
];

const PLANES = ["Ground", "1", "2", "3"];

function newCitizen(regionId: number, initialPoint?: WorldPoint | null): CitizenInfo {
  // Centre of the region is a defensible default: it's guaranteed inside the file's own
  // region, so a citizen created without touching the map still loads correctly.
  const origin = regionOrigin(regionId);
  const centre: WorldPoint = { x: origin.x + 32, y: origin.y + 32, plane: 0 };
  return {
    uuid: "",
    regionId,
    entityType: "StationaryCitizen",
    name: "",
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

const TYPE_BADGE: Record<string, string> = {
  StationaryCitizen: "badge-stationary",
  WanderingCitizen: "badge-wandering",
  ScriptedCitizen: "badge-scripted",
};

export function CitizenEditorView({ regionId, uuid, initialPoint, cloneFromNpcId, onBack, onCreated }: Props) {
  const toast = useToast();
  const isCreate = uuid === null;
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [draft, setDraft] = useState<CitizenInfo | null>(null);
  // What's on disk, to tell whether the form has unsaved edits.
  const [savedJson, setSavedJson] = useState<string>("");
  const [gltfText, setGltfText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Script state is separate from the citizen: the citizen only stores a name, and the
  // routine itself lives in Scripts/<name>.json, shared with any other citizen using it.
  const [scriptActions, setScriptActions] = useState<ScriptFile["actions"]>([]);
  const [savedScriptJson, setSavedScriptJson] = useState("[]");
  const [scriptUsedBy, setScriptUsedBy] = useState<number>(0);
  const [knownScripts, setKnownScripts] = useState<string[]>([]);
  // Route drawing and box drawing both claim map clicks, so they're one exclusive tool.
  const [mapTool, setMapTool] = useState<"position" | "route" | "wanderBox">("position");
  const [plane, setPlane] = useState(0);

  // Animation preview. Idle is the default because it's what a citizen shows almost all
  // of the time in game.
  const [previewAnim, setPreviewAnim] = useState<PreviewAnim>("idle");
  const [clip, setClip] = useState<ClipInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [previewRef, previewWidth] = useElementWidth<HTMLDivElement>(420);

  useEffect(() => {
    setLoadError(null);
    api
      .getRegion(regionId)
      .then((r) => {
        setRegion(r);
        if (isCreate) {
          const fresh = newCitizen(regionId, initialPoint);
          setDraft(fresh);
          setSavedJson(JSON.stringify(fresh));
          setPlane(initialPoint?.plane ?? 0);
          return;
        }
        const citizen = r.citizenRoster.find((c) => c.uuid === uuid) ?? null;
        if (!citizen) {
          setLoadError(`Citizen ${uuid} was not found in region ${regionId}. It may have been deleted or moved.`);
          return;
        }
        setDraft(citizen);
        setSavedJson(JSON.stringify(citizen));
        setPlane(citizen.worldLocation.plane);
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, uuid, isCreate]);

  useEffect(() => {
    api
      .listScripts()
      .then((all) => setKnownScripts(all.map((s) => s.name)))
      .catch(() => undefined);
  }, []);

  // Load the referenced script whenever the name changes, so switching a citizen onto an
  // existing routine shows that routine rather than an empty editor.
  const startScript = draft?.startScript ?? null;
  useEffect(() => {
    if (!startScript) {
      setScriptActions([]);
      setSavedScriptJson("[]");
      setScriptUsedBy(0);
      return;
    }
    let cancelled = false;
    // Debounced: the name is a free-text field and every keystroke would otherwise fetch.
    const handle = window.setTimeout(() => {
      api
        .getScript(startScript)
        .then((s) => {
          if (cancelled) return;
          setScriptActions(s.actions);
          setSavedScriptJson(JSON.stringify(s.actions));
        })
        .catch(() => {
          // A name that doesn't exist yet is the normal create case, not an error.
          if (cancelled) return;
          setScriptActions([]);
          setSavedScriptJson("[]");
        });
      api
        .listScripts()
        .then((all) => {
          if (cancelled) return;
          const match = all.find((s) => s.name === startScript);
          setScriptUsedBy(match?.usedBy.filter((u) => u.uuid !== uuid).length ?? 0);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [startScript, uuid]);

  const recolorMismatch = !!draft && (draft.modelRecolorFind?.length ?? 0) !== (draft.modelRecolorReplace?.length ?? 0);

  // Seeding from a game NPC, applied as a patch after the blank draft exists so it can't
  // race the region load and is a no-op on an already-saved citizen.
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
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isCreate, cloneFromNpcId, region]);

  const previewAnimName =
    previewAnim === "idle" ? (draft?.idleAnimation ?? null) : previewAnim === "move" ? (draft?.moveAnimation ?? null) : null;
  const previewAnimationId = animationSequenceId(previewAnimName);

  const modelKey = draft ? `${draft.modelIds.join(",")}|${(draft.modelRecolorFind ?? []).join(",")}|${(draft.modelRecolorReplace ?? []).join(",")}` : "";
  useEffect(() => {
    if (!draft || recolorMismatch || draft.modelIds.length === 0) {
      setGltfText(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .render({
          modelIds: draft.modelIds,
          recolorFind: draft.modelRecolorFind ?? [],
          recolorReplace: draft.modelRecolorReplace ?? [],
          animationId: previewAnimationId,
        })
        .then((gltf) => {
          if (cancelled) return;
          setGltfText(gltf);
          setPreviewError(null);
        })
        .catch((e) => !cancelled && setPreviewError(e.message));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, recolorMismatch, previewAnimationId]);

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

  const route = useMemo(
    () => (draft?.entityType === "ScriptedCitizen" ? routePoints(scriptActions) : []),
    [draft?.entityType, scriptActions],
  );

  const citizenDirty = !!draft && JSON.stringify(draft) !== savedJson;
  const scriptDirty = draft?.entityType === "ScriptedCitizen" && JSON.stringify(scriptActions) !== savedScriptJson;
  const dirty = isCreate || citizenDirty || scriptDirty;
  useUnsavedChangesWarning(!isCreate && (citizenDirty || !!scriptDirty));

  // Derived validation, computed before the early returns so hook order stays stable.
  const problems: string[] = [];
  let boxWidth = 0;
  let boxHeight = 0;
  let wanderBox: WanderBox | null = null;
  let positionOutsideBox = false;
  if (draft) {
    const isWandering = draft.entityType === "WanderingCitizen";
    wanderBox = isWandering && draft.wanderBoxBL && draft.wanderBoxTR ? { bl: draft.wanderBoxBL, tr: draft.wanderBoxTR } : null;
    // Util.calculateBoundingBox measures span, not tile count: it throws when width and
    // height are both <= 1, so a 2x2-tile box is invalid but a 3x2 one is fine.
    boxWidth = wanderBox ? Math.abs(wanderBox.tr.x - wanderBox.bl.x) : 0;
    boxHeight = wanderBox ? Math.abs(wanderBox.tr.y - wanderBox.bl.y) : 0;
    positionOutsideBox =
      !!wanderBox &&
      (draft.worldLocation.x < wanderBox.bl.x ||
        draft.worldLocation.x > wanderBox.tr.x ||
        draft.worldLocation.y < wanderBox.bl.y ||
        draft.worldLocation.y > wanderBox.tr.y);
    if (!draft.name.trim()) problems.push("Give the citizen a name.");
    if (draft.modelIds.length === 0) problems.push("Pick an appearance (at least one model).");
    if (recolorMismatch) problems.push("Recolour find/replace lists must be the same length.");
    if (isWandering && !wanderBox) problems.push("Draw a wander box on the map.");
    if (wanderBox && boxWidth <= 1 && boxHeight <= 1) problems.push("The wander box must be bigger than 2×2 tiles.");
    if (draft.entityType === "ScriptedCitizen") {
      if (!draft.startScript?.trim()) problems.push("Name the script this citizen runs.");
      else if (!/^[A-Za-z0-9_-]+$/.test(draft.startScript)) problems.push("Script names can only use letters, numbers, - and _.");
      problems.push(...scriptProblems(scriptActions));
    }
  }
  const canSave = problems.length === 0 && !saving;

  async function handleSave() {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      // The script is written first: if it fails, the citizen isn't left pointing at a
      // routine that doesn't exist (ScriptLoader returns null and the citizen silently
      // never moves, which is very hard to diagnose from the plugin side).
      if (draft.entityType === "ScriptedCitizen" && draft.startScript) {
        await api.saveScript(draft.startScript, { actions: scriptActions });
        setSavedScriptJson(JSON.stringify(scriptActions));
      }
      const cleaned: CitizenInfo = { ...draft, name: draft.name.trim(), remarks: draft.remarks.filter((r) => r.trim()) };
      if (isCreate) {
        const updated = await api.createCitizen(regionId, cleaned);
        const created = updated.citizenRoster[updated.citizenRoster.length - 1];
        toast.success(`Created ${created.name}`);
        onCreated(created.uuid);
      } else {
        const updated = await api.saveCitizen(regionId, uuid!, cleaned);
        const saved = updated.citizenRoster.find((c) => c.uuid === uuid) ?? cleaned;
        setDraft(saved);
        setSavedJson(JSON.stringify(saved));
        setRegion(updated);
        toast.success(`Saved ${saved.name}`);
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  useSaveShortcut(handleSave, canSave);

  // Remarks are edited as plain text, one per line. Kept as local text so blank lines and
  // trailing newlines survive while typing; the array is derived on every change.
  const [remarksText, setRemarksText] = useState("");
  const remarksLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draft) return;
    const key = `${draft.uuid}|${savedJson.length}`;
    if (remarksLoadedFor.current !== key) {
      remarksLoadedFor.current = key;
      setRemarksText((draft.remarks ?? []).join("\n"));
    }
  }, [draft, savedJson]);

  if (loadError) {
    return (
      <div className="page-narrow">
        <div className="callout callout-danger" style={{ marginBottom: 12 }}>
          {loadError}
        </div>
        <button onClick={onBack}>
          <Icon name="back" /> Back to region
        </button>
      </div>
    );
  }
  if (!region || !draft) return <PageLoading label="Loading citizen…" />;

  const patch = (fields: Partial<CitizenInfo>) => setDraft({ ...draft, ...fields });
  const isWandering = draft.entityType === "WanderingCitizen";
  const isScripted = draft.entityType === "ScriptedCitizen";

  // The box plane is pinned to the citizen's own plane: a wander box on a different plane
  // to its citizen is accepted by the Java loader and then silently never used.
  const setWanderBox = (box: WanderBox) => {
    const p = draft.worldLocation.plane;
    patch({ wanderBoxBL: { ...box.bl, plane: p }, wanderBoxTR: { ...box.tr, plane: p } });
  };

  function changeType(entityType: EntityType) {
    if (!draft) return;
    patch({
      entityType,
      // Seeded so switching types produces something valid rather than a failed save.
      wanderBoxBL:
        entityType === "WanderingCitizen"
          ? (draft.wanderBoxBL ?? { x: draft.worldLocation.x - 3, y: draft.worldLocation.y - 3, plane: draft.worldLocation.plane })
          : null,
      wanderBoxTR:
        entityType === "WanderingCitizen"
          ? (draft.wanderBoxTR ?? { x: draft.worldLocation.x + 3, y: draft.worldLocation.y + 3, plane: draft.worldLocation.plane })
          : null,
      startScript: entityType === "ScriptedCitizen" ? (draft.startScript ?? suggestScriptName(draft, regionId)) : null,
    });
    setMapTool(entityType === "WanderingCitizen" ? "wanderBox" : entityType === "ScriptedCitizen" ? "route" : "position");
  }

  function handleBack() {
    if (!isCreate && (citizenDirty || scriptDirty) && !confirm("Discard unsaved changes?")) return;
    onBack();
  }

  function revert() {
    if (!confirm("Revert all unsaved changes?")) return;
    const saved = JSON.parse(savedJson) as CitizenInfo;
    setDraft(saved);
    setRemarksText((saved.remarks ?? []).join("\n"));
    setScriptActions(JSON.parse(savedScriptJson));
  }

  const title = draft.name.trim() || (isCreate ? "New citizen" : "Unnamed citizen");
  const mapHint =
    mapTool === "route"
      ? "Click tiles to add walk steps, in order."
      : mapTool === "wanderBox"
        ? "Drag across the map to draw the box, or drag its orange corners."
        : "Click a tile, or drag the red marker, to place this citizen.";

  return (
    <div>
      <div className="savebar">
        <button className="btn-ghost btn-icon" onClick={handleBack} title="Back to region">
          <Icon name="back" />
        </button>
        <h1 className="truncate">{title}</h1>
        <span className={`badge ${TYPE_BADGE[draft.entityType] ?? ""}`}>{draft.entityType.replace("Citizen", "")}</span>
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
        <div className="spacer" />
        {!isCreate && (citizenDirty || scriptDirty) && (
          <span className="row-tight xsmall muted">
            <span className="dirty-dot" /> Unsaved changes
          </span>
        )}
        {problems.length > 0 && (
          <span className="badge badge-warning" title={problems.join("\n")}>
            {problems.length} to fix
          </span>
        )}
        {!isCreate && (citizenDirty || scriptDirty) && (
          <button className="btn-ghost" onClick={revert}>
            Revert
          </button>
        )}
        <button className="btn-primary" onClick={handleSave} disabled={!canSave || (!dirty && !isCreate)} title="Save (Ctrl+S)">
          <Icon name="save" />
          {saving ? "Saving…" : isCreate ? "Create citizen" : "Save"}
        </button>
      </div>

      <div className="editor">
        <div className="stack">
          {problems.length > 0 && (
            <div className="callout callout-warning">
              <div>
                {problems.map((p) => (
                  <div key={p}>• {p}</div>
                ))}
              </div>
            </div>
          )}

          <section className="card card-pad stack">
            <div className="section-title">Identity</div>
            <div className="grid-2">
              <label className="field">
                <span>Name</span>
                <input
                  autoFocus={isCreate}
                  value={draft.name}
                  placeholder="e.g. Eugene"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Facing</span>
                <select
                  value={ORIENTATIONS.some((o) => o.value === draft.baseOrientation) ? (draft.baseOrientation ?? 0) : "custom"}
                  onChange={(e) => patch({ baseOrientation: Number(e.target.value) })}
                >
                  {ORIENTATIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {!ORIENTATIONS.some((o) => o.value === draft.baseOrientation) && (
                    <option value="custom" disabled>
                      Custom ({draft.baseOrientation})
                    </option>
                  )}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Examine text</span>
              <input
                value={draft.examineText}
                placeholder="Shown when a player examines them"
                onChange={(e) => patch({ examineText: e.target.value })}
              />
            </label>
            <div className="field">
              <span>Behaviour</span>
              <div className="grid-3">
                {CITIZEN_TYPES.map((t) => (
                  <button
                    key={t.type}
                    className={draft.entityType === t.type ? "is-active" : ""}
                    onClick={() => changeType(t.type)}
                    style={{ flexDirection: "column", alignItems: "flex-start", whiteSpace: "normal", textAlign: "left", padding: "8px 10px", height: "100%" }}
                  >
                    <span>{t.label}</span>
                    <span className="xsmall muted" style={{ fontWeight: 400 }}>
                      {t.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Idle animation</span>
                <select value={draft.idleAnimation ?? ""} onChange={(e) => patch({ idleAnimation: e.target.value || null })}>
                  <option value="">(none)</option>
                  {ANIMATION_IDS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Walk animation</span>
                <select
                  value={draft.moveAnimation ?? ""}
                  onChange={(e) => patch({ moveAnimation: e.target.value || null })}
                  disabled={draft.entityType === "StationaryCitizen"}
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
          </section>

          {isScripted && (
            <section className="card card-pad stack">
              <div className="row">
                <div className="section-title" style={{ margin: 0 }}>
                  Routine
                </div>
                <div className="spacer" />
                <label className="row-tight xsmall muted">
                  Script file
                  <input
                    list="known-scripts"
                    value={draft.startScript ?? ""}
                    onChange={(e) => patch({ startScript: e.target.value.trim() })}
                    style={{ width: 200 }}
                    className="mono"
                  />
                  <datalist id="known-scripts">
                    {knownScripts.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </label>
              </div>
              {scriptUsedBy > 0 && (
                <div className="callout callout-warning">
                  {scriptUsedBy} other citizen{scriptUsedBy === 1 ? " uses" : "s use"} this script. Editing the routine changes their
                  behaviour too.
                </div>
              )}
              <ScriptEditor
                actions={scriptActions}
                onChange={setScriptActions}
                routeMode={mapTool === "route"}
                onToggleRouteMode={() => setMapTool((t) => (t === "route" ? "position" : "route"))}
                origin={draft.worldLocation}
              />
            </section>
          )}

          <section className="card card-pad stack">
            <div className="row">
              <div className="section-title" style={{ margin: 0 }}>
                Remarks
              </div>
              <span className="xsmall faint">Said at random every minute or so. One per line.</span>
            </div>
            <textarea
              rows={3}
              value={remarksText}
              placeholder={"Lovely day for it.\nHave you seen my cat?"}
              onChange={(e) => {
                setRemarksText(e.target.value);
                patch({ remarks: e.target.value.split("\n").map((r) => r.trim()).filter(Boolean) });
              }}
            />
          </section>

          <section className="card card-pad stack">
            <div className="section-title">Appearance</div>
            <AppearancePicker
              value={{
                modelIds: draft.modelIds,
                recolorFind: draft.modelRecolorFind ?? [],
                recolorReplace: draft.modelRecolorReplace ?? [],
              }}
              onChange={(next) =>
                patch({ modelIds: next.modelIds, modelRecolorFind: next.recolorFind, modelRecolorReplace: next.recolorReplace })
              }
            />
          </section>
        </div>

        <div className="editor-side">
          <section className="card" style={{ overflow: "hidden" }}>
            <div ref={previewRef} style={{ height: 300, background: "radial-gradient(circle at 50% 40%, var(--surface-3), var(--bg) 75%)" }}>
              {gltfText ? (
                <LiveViewer
                  gltfText={gltfText}
                  width={previewWidth}
                  height={300}
                  paused={paused}
                  timeScale={timeScale}
                  seekTime={frameIndex != null && clip ? (clip.frameTimes[frameIndex] ?? null) : null}
                  onClipLoaded={setClip}
                />
              ) : (
                <div className="empty" style={{ height: "100%" }}>
                  {draft.modelIds.length === 0 ? (
                    <>
                      <strong>No appearance yet</strong>
                      <span>Search for an NPC or build one from kits.</span>
                    </>
                  ) : previewError ? (
                    <span className="error-text">{previewError}</span>
                  ) : (
                    <div className="spinner" />
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: "0 12px 10px" }}>
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
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              Placement
              <span className="badge mono">
                {draft.worldLocation.x}, {draft.worldLocation.y}
                {draft.worldLocation.plane ? ` · z${draft.worldLocation.plane}` : ""}
              </span>
              <div className="spacer" />
              <div className="segmented" title="Floor">
                {PLANES.map((p, i) => (
                  <button key={i} className={plane === i ? "is-active" : ""} onClick={() => setPlane(i)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "8px 10px 0" }} className="row">
              <div className="segmented">
                <button className={mapTool === "position" ? "is-active" : ""} onClick={() => setMapTool("position")}>
                  Position
                </button>
                {isWandering && (
                  <button className={mapTool === "wanderBox" ? "is-active" : ""} onClick={() => setMapTool("wanderBox")}>
                    Wander box
                  </button>
                )}
                {isScripted && (
                  <button className={mapTool === "route" ? "is-active" : ""} onClick={() => setMapTool("route")}>
                    Route
                  </button>
                )}
              </div>
              {wanderBox && (
                <span className="xsmall muted">
                  {boxWidth + 1}×{boxHeight + 1} tiles
                </span>
              )}
            </div>
            <div style={{ padding: 10 }}>
              <RegionTileMap
                regionId={regionId}
                plane={plane}
                position={draft.worldLocation}
                onPositionChange={(point) => patch({ worldLocation: point })}
                wanderBox={wanderBox}
                onWanderBoxChange={isWandering ? setWanderBox : undefined}
                route={route}
                onRouteAppend={(point) => setScriptActions((prev) => appendWaypoint(prev, point))}
                clickMode={mapTool}
                markers={otherMarkers}
                height={360}
              />
              <div className="xsmall faint" style={{ marginTop: 6 }}>
                {mapHint}
              </div>
              {isWandering && wanderBox && positionOutsideBox && (
                <div className="callout callout-info xsmall" style={{ marginTop: 6 }}>
                  The position is outside the box. Wanderers spawn on a random tile inside it, so that's fine, but the
                  marker won't match where they appear.
                </div>
              )}
              {isWandering && (
                <button
                  className="btn-sm"
                  style={{ marginTop: 6 }}
                  onClick={() =>
                    setWanderBox({
                      bl: { ...draft.worldLocation, x: draft.worldLocation.x - 3, y: draft.worldLocation.y - 3 },
                      tr: { ...draft.worldLocation, x: draft.worldLocation.x + 3, y: draft.worldLocation.y + 3 },
                    })
                  }
                >
                  Centre a 7×7 box on the citizen
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
