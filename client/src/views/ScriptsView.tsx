import { useEffect, useMemo, useState } from "react";
import type { ScriptAction, ScriptSummary, WorldPoint } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ScriptEditor, appendWaypoint, routePoints, scriptProblems } from "../components/ScriptEditor";
import { RegionTileMap } from "../components/RegionTileMap";
import { regionLabel } from "../data/regionNames";
import { Icon } from "../ui/Icon";
import { PageLoading } from "../ui/AppShell";
import { useToast } from "../ui/Toasts";
import { useSaveShortcut, useUnsavedChangesWarning } from "../ui/hooks";

type Props = {
  selected: string | null;
  onSelect: (name: string | null) => void;
  onOpenCitizen: (regionId: number, uuid: string) => void;
};

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function regionOf(p: WorldPoint): number {
  return ((p.x >> 6) << 8) | (p.y >> 6);
}

/**
 * Library of every routine in Scripts/. Scripts are global and referenced by name, so this is
 * where you see who uses what, and edit a shared routine once instead of via each citizen.
 */
export function ScriptsView({ selected, onSelect, onOpenCitizen }: Props) {
  const toast = useToast();
  const [scripts, setScripts] = useState<ScriptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [actions, setActions] = useState<ScriptAction[]>([]);
  const [savedJson, setSavedJson] = useState("[]");
  const [loadingScript, setLoadingScript] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [routeMode, setRouteMode] = useState(false);
  const [plane, setPlane] = useState(0);
  const [saving, setSaving] = useState(false);

  const refresh = () =>
    api
      .listScripts()
      .then(setScripts)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!selected) {
      setActions([]);
      setSavedJson("[]");
      return;
    }
    let cancelled = false;
    setLoadingScript(true);
    api
      .getScript(selected)
      .then((s) => {
        if (cancelled) return;
        setActions(s.actions);
        setSavedJson(JSON.stringify(s.actions));
        setIsNew(false);
      })
      .catch(() => {
        if (cancelled) return;
        setActions([]);
        setSavedJson("[]");
        setIsNew(true);
      })
      .finally(() => !cancelled && setLoadingScript(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const summary = scripts?.find((s) => s.name === selected) ?? null;
  const dirty = isNew || JSON.stringify(actions) !== savedJson;
  useUnsavedChangesWarning(!!selected && dirty && !isNew);
  const route = useMemo(() => routePoints(actions), [actions]);
  const problems = scriptProblems(actions);

  // Which chunk to show on the map: where the route starts, else where the first user stands.
  const mapRegion = route[0] ? regionOf(route[0]) : (summary?.usedBy[0]?.regionId ?? null);
  useEffect(() => {
    if (route[0]) setPlane(route[0].plane);
    // Only when switching scripts - not every time a waypoint is added on another floor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function save() {
    if (!selected || saving || problems.length > 0) return;
    setSaving(true);
    try {
      await api.saveScript(selected, { actions });
      setSavedJson(JSON.stringify(actions));
      setIsNew(false);
      toast.success(`Saved ${selected}`);
      void refresh();
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }
  useSaveShortcut(save, !!selected && dirty);

  async function remove() {
    if (!selected || !summary) return;
    const users = summary.usedBy.length;
    if (!confirm(users > 0 ? `${users} citizen(s) use "${selected}" and will stop moving. Delete anyway?` : `Delete "${selected}"?`)) return;
    try {
      await api.deleteScript(selected);
      toast.success(`Deleted ${selected}`);
      onSelect(null);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function create() {
    const name = prompt("Name for the new script (letters, numbers, - and _):")?.trim();
    if (!name) return;
    if (!NAME_PATTERN.test(name)) {
      toast.error("Script names can only use letters, numbers, - and _.");
      return;
    }
    if (scripts?.some((s) => s.name === name)) {
      onSelect(name);
      return;
    }
    onSelect(name);
  }

  if (error) return <div className="callout callout-danger">{error}</div>;
  if (!scripts) return <PageLoading label="Loading scripts…" />;

  const visible = scripts.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
      <div className="card" style={{ position: "sticky", top: 0 }}>
        <div className="card-header">
          Scripts <span className="faint">{scripts.length}</span>
          <div className="spacer" />
          <button className="btn-sm btn-primary" onClick={create}>
            <Icon name="plus" size={13} /> New
          </button>
        </div>
        <div style={{ padding: 8 }}>
          <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto", padding: "0 6px 8px" }}>
          {visible.map((s) => (
            <div key={s.name} className={`list-item${s.name === selected ? " selected" : ""}`} onClick={() => onSelect(s.name)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="title truncate mono">{s.name}</div>
                <div className="meta">
                  {s.actionCount} steps · {s.usedBy.length === 0 ? "unused" : `used by ${s.usedBy.length}`}
                </div>
              </div>
              {s.usedBy.length === 0 && <span className="badge">unused</span>}
            </div>
          ))}
          {visible.length === 0 && <div className="empty">No scripts match.</div>}
        </div>
      </div>

      {!selected ? (
        <div className="card empty" style={{ minHeight: 320 }}>
          <strong>Pick a script to edit</strong>
          <span>Scripts are looping routines that scripted citizens follow: walk somewhere, play an animation, say something.</span>
        </div>
      ) : loadingScript ? (
        <PageLoading label={`Loading ${selected}…`} />
      ) : (
        <div className="stack">
          <div className="row">
            <h1 className="mono" style={{ margin: 0 }}>
              {selected}
            </h1>
            {isNew && <span className="badge badge-warning">new, not saved</span>}
            {!isNew && dirty && (
              <span className="row-tight xsmall muted">
                <span className="dirty-dot" /> Unsaved
              </span>
            )}
            <div className="spacer" />
            {!isNew && (
              <button className="btn-danger" onClick={remove}>
                <Icon name="trash" /> Delete
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={!dirty || saving || problems.length > 0} title="Save (Ctrl+S)">
              <Icon name="save" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {summary && summary.usedBy.length > 0 && (
            <div className="row xsmall">
              <span className="muted">Used by</span>
              {summary.usedBy.map((u) => (
                <button key={u.uuid} className="btn-sm" onClick={() => onOpenCitizen(u.regionId, u.uuid)} title={regionLabel(u.regionId)}>
                  {u.name}
                </button>
              ))}
            </div>
          )}

          <div className="editor">
            <section className="card card-pad">
              <ScriptEditor
                actions={actions}
                onChange={setActions}
                routeMode={routeMode}
                onToggleRouteMode={() => setRouteMode((v) => !v)}
                origin={route[0] ?? null}
              />
            </section>
            <section className="card editor-side">
              <div className="card-header">
                Route
                <div className="spacer" />
                <div className="segmented">
                  {["Ground", "1", "2", "3"].map((p, i) => (
                    <button key={i} className={plane === i ? "is-active" : ""} onClick={() => setPlane(i)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: 10 }}>
                {mapRegion != null ? (
                  <>
                    <RegionTileMap
                      regionId={mapRegion}
                      plane={plane}
                      position={null}
                      route={route}
                      onRouteAppend={(p) => setActions((prev) => appendWaypoint(prev, p))}
                      clickMode={routeMode ? "route" : "position"}
                      height={380}
                    />
                    <div className="xsmall faint" style={{ marginTop: 6 }}>
                      {regionLabel(mapRegion)} · turn on “Add waypoints on map”, then click tiles.
                    </div>
                  </>
                ) : (
                  <div className="empty">This script has no walk steps and no users yet, so there is no map to show.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
