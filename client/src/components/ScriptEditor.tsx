import { useState } from "react";
import type { ActionType, CardinalDirection, ScriptAction, WorldPoint } from "@citizens-helper/shared/src/types";
import { ANIMATION_IDS } from "@citizens-helper/shared/src/animationIds";
import { Icon, type IconName } from "../ui/Icon";

type Props = {
  actions: ScriptAction[];
  onChange: (actions: ScriptAction[]) => void;
  // Route building is driven from the map; when on, map clicks append WalkTo steps.
  routeMode: boolean;
  onToggleRouteMode: () => void;
  // Where the citizen stands; templates that walk somewhere start from here.
  origin?: WorldPoint | null;
};

const ACTION_META: Record<ActionType, { label: string; icon: IconName; cls: string; hint: string }> = {
  WalkTo: { label: "Walk to", icon: "walk", cls: "step-walk", hint: "Walk to a tile (click the map)" },
  Animation: { label: "Animate", icon: "film", cls: "step-anim", hint: "Play an animation" },
  Say: { label: "Say", icon: "chat", cls: "step-say", hint: "Overhead chat line" },
  FaceDirection: { label: "Face", icon: "compass", cls: "step-face", hint: "Turn to a direction" },
  Idle: { label: "Wait", icon: "clock", cls: "step-idle", hint: "Do nothing for a while" },
};

const ACTION_TYPES: ActionType[] = ["WalkTo", "Animation", "Say", "FaceDirection", "Idle"];

const DIRECTIONS: CardinalDirection[] = [
  "North",
  "NorthEast",
  "East",
  "SouthEast",
  "South",
  "SouthWest",
  "West",
  "NorthWest",
];

function blankAction(action: ActionType): ScriptAction {
  const base: ScriptAction = { action, secondsTilNextAction: action === "Idle" ? 3 : 0.5 };
  if (action === "FaceDirection") return { ...base, targetRotation: "South" };
  if (action === "Animation") return { ...base, animationId: ANIMATION_IDS[0] };
  if (action === "Say") return { ...base, message: "", secondsTilNextAction: 4 };
  return base;
}

// Starting points for the most common routines, so a new scripted citizen isn't a blank page.
const TEMPLATES: { label: string; build: (origin: WorldPoint | null) => ScriptAction[] }[] = [
  {
    label: "Patrol (there and back)",
    build: (o) =>
      o
        ? [
            { action: "WalkTo", secondsTilNextAction: 2, targetPosition: { ...o, x: o.x + 4 } },
            { action: "FaceDirection", secondsTilNextAction: 3, targetRotation: "East" },
            { action: "WalkTo", secondsTilNextAction: 2, targetPosition: o },
            { action: "FaceDirection", secondsTilNextAction: 3, targetRotation: "West" },
          ]
        : [],
  },
  {
    label: "Work at a station",
    build: () => [
      { action: "Animation", secondsTilNextAction: 0, animationId: ANIMATION_IDS.includes("Swinging") ? "Swinging" : ANIMATION_IDS[0], timesToLoop: 4 },
      { action: "Idle", secondsTilNextAction: 2 },
      { action: "Say", secondsTilNextAction: 5, message: "Almost done..." },
    ],
  },
  {
    label: "Idle chatter",
    build: () => [
      { action: "Say", secondsTilNextAction: 6, message: "Lovely weather today." },
      { action: "Animation", secondsTilNextAction: 4, animationId: ANIMATION_IDS.includes("Think") ? "Think" : ANIMATION_IDS[0] },
      { action: "Idle", secondsTilNextAction: 8 },
    ],
  },
];

/**
 * Rough wall-clock length of one loop: explicit waits plus ~0.6s per tile walked (the
 * plugin moves citizens at one tile per game tick). Good enough to spot a routine that
 * cycles too fast to read, or so slow nobody will ever see it finish.
 */
function estimateLoopSeconds(actions: ScriptAction[], origin: WorldPoint | null | undefined): number {
  let total = 0;
  let pos = origin ?? null;
  for (const a of actions) {
    total += Math.max(0.1, a.secondsTilNextAction ?? 0);
    if (a.action === "WalkTo" && a.targetPosition) {
      if (pos) total += Math.max(Math.abs(a.targetPosition.x - pos.x), Math.abs(a.targetPosition.y - pos.y)) * 0.6;
      pos = a.targetPosition;
    }
    if (a.action === "Animation") total += 1.2 * (a.timesToLoop ?? 1);
  }
  return total;
}

export function ScriptEditor({ actions, onChange, routeMode, onToggleRouteMode, origin }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(index: number, patch: Partial<ScriptAction>) {
    onChange(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function remove(index: number) {
    onChange(actions.filter((_, i) => i !== index));
  }

  function duplicate(index: number) {
    const next = [...actions];
    next.splice(index + 1, 0, structuredClone(actions[index]));
    onChange(next);
  }

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= actions.length) return;
    const next = [...actions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  const missingTargets = actions.filter((a) => a.action === "WalkTo" && !a.targetPosition).length;
  const emptySays = actions.filter((a) => a.action === "Say" && !a.message?.trim()).length;
  const loopSeconds = estimateLoopSeconds(actions, origin);

  return (
    <div className="stack">
      <div className="row">
        <button
          className={routeMode ? "is-active" : ""}
          onClick={onToggleRouteMode}
          title="While on, clicking tiles on the map appends Walk to steps"
        >
          <Icon name="walk" />
          {routeMode ? "Placing waypoints… (click map)" : "Add waypoints on map"}
        </button>
        <div className="spacer" />
        {actions.length > 0 && (
          <span className="badge" title="Estimated length of one loop of the routine">
            <Icon name="clock" size={12} /> ~{loopSeconds < 60 ? `${Math.round(loopSeconds)}s` : `${(loopSeconds / 60).toFixed(1)}m`} loop
          </span>
        )}
      </div>

      {actions.length === 0 ? (
        <div className="card empty" style={{ padding: 18 }}>
          <strong>No steps yet</strong>
          <span>The routine repeats forever. Start from a template or add steps below.</span>
          <div className="row" style={{ justifyContent: "center", marginTop: 6 }}>
            {TEMPLATES.map((t) => (
              <button key={t.label} className="btn-sm" onClick={() => onChange(t.build(origin ?? null))} disabled={t.build(origin ?? null).length === 0}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="script-list">
          {actions.map((action, i) => {
            const meta = ACTION_META[action.action];
            return (
              <div
                key={i}
                className={`script-step ${meta.cls}${dragIndex === i ? " dragging" : ""}${overIndex === i && dragIndex !== i ? " drop-target" : ""}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex != null) moveTo(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                <div className="num" title="Drag to reorder">
                  {i + 1}
                </div>
                <div className="body">
                  <select
                    value={action.action}
                    onChange={(e) => onChange(actions.map((a, j) => (j === i ? blankAction(e.target.value as ActionType) : a)))}
                    title={meta.hint}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTION_META[t].label}
                      </option>
                    ))}
                  </select>

                  {action.action === "WalkTo" &&
                    (action.targetPosition ? (
                      <span className="badge mono">
                        {action.targetPosition.x}, {action.targetPosition.y}
                        {action.targetPosition.plane ? ` · z${action.targetPosition.plane}` : ""}
                      </span>
                    ) : (
                      <span className="badge badge-warning">click a tile on the map</span>
                    ))}

                  {action.action === "Animation" && (
                    <>
                      <select value={action.animationId ?? ""} onChange={(e) => update(i, { animationId: e.target.value })}>
                        {ANIMATION_IDS.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      <label className="row-tight xsmall muted" title="How many times to play it">
                        ×
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={action.timesToLoop ?? 1}
                          onChange={(e) => update(i, { timesToLoop: Math.max(1, Number(e.target.value) || 1) })}
                          style={{ width: 52 }}
                        />
                      </label>
                    </>
                  )}

                  {action.action === "Say" && (
                    <input
                      value={action.message ?? ""}
                      onChange={(e) => update(i, { message: e.target.value })}
                      placeholder="What do they say?"
                      maxLength={80}
                      style={{ flex: 1, minWidth: 140 }}
                    />
                  )}

                  {action.action === "FaceDirection" && (
                    <select
                      value={action.targetRotation ?? "South"}
                      onChange={(e) => update(i, { targetRotation: e.target.value as CardinalDirection })}
                    >
                      {DIRECTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}

                  <label className="row-tight xsmall muted" title="Seconds to wait before the next step">
                    then wait
                    <input
                      type="number"
                      step={0.25}
                      min={0}
                      value={action.secondsTilNextAction ?? 0}
                      onChange={(e) => update(i, { secondsTilNextAction: Math.max(0, Number(e.target.value)) })}
                      style={{ width: 60 }}
                    />
                    s
                  </label>
                </div>
                <div className="row-tight">
                  <button className="btn-ghost btn-sm btn-icon" onClick={() => moveTo(i, i - 1)} disabled={i === 0} title="Move up">
                    <Icon name="up" size={14} />
                  </button>
                  <button
                    className="btn-ghost btn-sm btn-icon"
                    onClick={() => moveTo(i, i + 1)}
                    disabled={i === actions.length - 1}
                    title="Move down"
                  >
                    <Icon name="down" size={14} />
                  </button>
                  <button className="btn-ghost btn-sm btn-icon" onClick={() => duplicate(i)} title="Duplicate step">
                    <Icon name="copy" size={14} />
                  </button>
                  <button className="btn-ghost btn-sm btn-icon" onClick={() => remove(i)} title="Remove step">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="add-step">
        {ACTION_TYPES.map((t) => (
          <button key={t} className="btn-sm" onClick={() => onChange([...actions, blankAction(t)])} title={ACTION_META[t].hint}>
            <Icon name={ACTION_META[t].icon} size={13} /> {ACTION_META[t].label}
          </button>
        ))}
      </div>

      {(missingTargets > 0 || emptySays > 0) && (
        <div className="callout callout-warning">
          {missingTargets > 0 && `${missingTargets} walk step${missingTargets === 1 ? " has" : "s have"} no target tile. `}
          {emptySays > 0 && `${emptySays} say step${emptySays === 1 ? " is" : "s are"} empty.`}
        </div>
      )}
    </div>
  );
}

// Appending a waypoint from the map fills the last WalkTo if it has no target yet,
// otherwise adds a new one - so clicking several tiles in a row lays down a path.
export function appendWaypoint(actions: ScriptAction[], point: WorldPoint): ScriptAction[] {
  const last = actions[actions.length - 1];
  if (last && last.action === "WalkTo" && !last.targetPosition) {
    return actions.map((a, i) => (i === actions.length - 1 ? { ...a, targetPosition: point } : a));
  }
  return [...actions, { action: "WalkTo", secondsTilNextAction: 0.5, targetPosition: point }];
}

export function routePoints(actions: ScriptAction[]): WorldPoint[] {
  return actions
    .filter((a) => a.action === "WalkTo" && a.targetPosition)
    .map((a) => a.targetPosition as WorldPoint);
}

/** Problems that would make the plugin skip or misbehave on this script. */
export function scriptProblems(actions: ScriptAction[]): string[] {
  const out: string[] = [];
  if (actions.some((a) => a.action === "WalkTo" && !a.targetPosition)) out.push("A walk step has no target tile.");
  if (actions.some((a) => a.action === "Say" && !a.message?.trim())) out.push("A say step is empty.");
  return out;
}
