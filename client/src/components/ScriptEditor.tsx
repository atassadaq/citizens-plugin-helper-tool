import type { ActionType, CardinalDirection, ScriptAction, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS } from "@citizens-helper/shared/src/animationIds";

type Props = {
  actions: ScriptAction[];
  onChange: (actions: ScriptAction[]) => void;
  // Route building is driven from the map; this reports which waypoint (index into the
  // WalkTo actions) the map is currently appending to.
  routeMode: boolean;
  onToggleRouteMode: () => void;
};

const ACTION_TYPES: ActionType[] = ["WalkTo", "Animation", "Say", "FaceDirection", "Idle"];

// CardinalDirection.java defines exactly these seven. NorthEast is genuinely missing from
// the Java enum, so offering it here would produce a script the plugin can't deserialize.
const DIRECTIONS: CardinalDirection[] = ["North", "NorthWest", "West", "SouthWest", "South", "SouthEast", "East"];

function blankAction(action: ActionType): ScriptAction {
  const base: ScriptAction = { action, secondsTilNextAction: 0.25 };
  if (action === "FaceDirection") return { ...base, targetRotation: "South" };
  if (action === "Animation") return { ...base, animationId: ANIMATION_IDS[0] };
  if (action === "Say") return { ...base, message: "" };
  return base;
}

export function ScriptEditor({ actions, onChange, routeMode, onToggleRouteMode }: Props) {
  function update(index: number, patch: Partial<ScriptAction>) {
    onChange(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function remove(index: number) {
    onChange(actions.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= actions.length) return;
    const next = [...actions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>Routine</strong>
        <button
          onClick={onToggleRouteMode}
          style={{
            fontSize: 12,
            padding: "3px 8px",
            background: routeMode ? "#5cb85c" : "#eee",
            color: routeMode ? "white" : "inherit",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {routeMode ? "Click map to add waypoints (on)" : "Add waypoints from map"}
        </button>
      </div>

      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
        The plugin polls this list and re-appends each action, so the routine loops forever - there's no end.
        `secondsTilNextAction` is the delay before the next step runs.
      </p>

      {actions.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>No actions yet.</p>}

      <ol style={{ paddingLeft: 20, margin: 0 }}>
        {actions.map((action, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={action.action}
                onChange={(e) => onChange(actions.map((a, j) => (j === i ? blankAction(e.target.value as ActionType) : a)))}
                style={{ fontSize: 12, padding: 2 }}
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {action.action === "WalkTo" && (
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {action.targetPosition
                    ? `(${action.targetPosition.x}, ${action.targetPosition.y}, z${action.targetPosition.plane})`
                    : "no target - click the map"}
                </span>
              )}

              {action.action === "Animation" && (
                <select
                  value={action.animationId ?? ""}
                  onChange={(e) => update(i, { animationId: e.target.value })}
                  style={{ fontSize: 12, padding: 2 }}
                >
                  {ANIMATION_IDS.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              )}

              {action.action === "Say" && (
                <input
                  value={action.message ?? ""}
                  onChange={(e) => update(i, { message: e.target.value })}
                  placeholder="message"
                  style={{ fontSize: 12, padding: 2, flex: 1, minWidth: 120 }}
                />
              )}

              {action.action === "FaceDirection" && (
                <select
                  value={action.targetRotation ?? "South"}
                  onChange={(e) => update(i, { targetRotation: e.target.value as CardinalDirection })}
                  style={{ fontSize: 12, padding: 2 }}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

              <label style={{ fontSize: 11, opacity: 0.75 }}>
                wait
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={action.secondsTilNextAction ?? 0}
                  onChange={(e) => update(i, { secondsTilNextAction: Number(e.target.value) })}
                  style={{ width: 52, fontSize: 12, marginLeft: 3, padding: 2 }}
                />
                s
              </label>

              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ fontSize: 11 }} title="Move up">
                &uarr;
              </button>
              <button onClick={() => move(i, 1)} disabled={i === actions.length - 1} style={{ fontSize: 11 }} title="Move down">
                &darr;
              </button>
              <button onClick={() => remove(i)} style={{ fontSize: 11, color: "crimson" }} title="Remove">
                &times;
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {ACTION_TYPES.map((t) => (
          <button key={t} onClick={() => onChange([...actions, blankAction(t)])} style={{ fontSize: 11 }}>
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

// Appending a waypoint from the map adds a WalkTo if the last action isn't an unfilled one,
// so clicking several tiles in a row lays down a path rather than overwriting one step.
export function appendWaypoint(actions: ScriptAction[], point: WorldPoint): ScriptAction[] {
  const last = actions[actions.length - 1];
  if (last && last.action === "WalkTo" && !last.targetPosition) {
    return actions.map((a, i) => (i === actions.length - 1 ? { ...a, targetPosition: point } : a));
  }
  return [...actions, { action: "WalkTo", secondsTilNextAction: 0.25, targetPosition: point }];
}

export function routePoints(actions: ScriptAction[]): WorldPoint[] {
  return actions
    .filter((a) => a.action === "WalkTo" && a.targetPosition)
    .map((a) => a.targetPosition as WorldPoint);
}
