import { useEffect, useState } from "react";
import type { KitSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "./ModelThumb";
import { hexToJagex, jagexToHex } from "../data/jagexColor";
import { Icon } from "../ui/Icon";

type Appearance = { modelIds: number[]; recolorFind: number[]; recolorReplace: number[] };
type ModelPart = { bodyPartId: number; name: string; kitId: number };

// One fetch for the whole session: the kit index is static and every citizen editor needs it.
let partIndexPromise: Promise<Record<string, ModelPart>> | null = null;
function usePartIndex(): Record<string, ModelPart> {
  const [index, setIndex] = useState<Record<string, ModelPart>>({});
  useEffect(() => {
    partIndexPromise ??= api.modelParts().catch(() => ({}));
    let alive = true;
    void partIndexPromise.then((i) => alive && setIndex(i));
    return () => {
      alive = false;
    };
  }, []);
  return index;
}

/**
 * Visual editor for a citizen's sub-models and recolours. Every model id gets its own 3D
 * thumbnail and, when it belongs to a known player kit, a body-part label - so "which of
 * these numbers is the hat?" is answered by looking, not guessing. A part can be swapped for
 * another kit of the same body part, or replaced by id.
 */
export function AppearanceParts({ value, onChange }: { value: Appearance; onChange: (next: Appearance) => void }) {
  const parts = usePartIndex();
  const [selected, setSelected] = useState<number | null>(null);
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    if (selected != null && selected >= value.modelIds.length) setSelected(null);
  }, [selected, value.modelIds.length]);

  const setModels = (modelIds: number[]) => onChange({ ...value, modelIds });

  return (
    <div className="stack">
      <div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="field-label">Parts ({value.modelIds.length})</span>
          <span className="xsmall faint">Click a part to swap or edit it.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
          {value.modelIds.map((id, i) => {
            const part = parts[String(id)];
            const active = selected === i;
            return (
              <button
                key={`${i}-${id}`}
                onClick={() => setSelected(active ? null : i)}
                className={active ? "is-active" : ""}
                title={`Model ${id}${part ? ` · ${part.name}` : ""}`}
                style={{ flexDirection: "column", padding: 6, height: "auto", gap: 4, whiteSpace: "normal" }}
              >
                <ModelThumb modelIds={[id]} recolorFind={value.recolorFind} recolorReplace={value.recolorReplace} size={72} />
                <span className="mono xsmall">{id}</span>
                <span className="badge" style={{ maxWidth: "100%" }}>
                  <span className="truncate">{part ? part.name : "Model"}</span>
                </span>
              </button>
            );
          })}
          <button
            onClick={() => {
              setModels([...value.modelIds, 0]);
              setSelected(value.modelIds.length);
            }}
            style={{ flexDirection: "column", minHeight: 124, borderStyle: "dashed", color: "var(--text-faint)" }}
            title="Add a part"
          >
            <Icon name="plus" size={20} />
            <span className="xsmall">Add part</span>
          </button>
        </div>
      </div>

      {selected != null && selected < value.modelIds.length && (
        <PartEditor
          modelId={value.modelIds[selected]}
          part={parts[String(value.modelIds[selected])] ?? null}
          appearance={value}
          onReplace={(models) => {
            const next = [...value.modelIds];
            next.splice(selected, 1, ...models);
            setModels(next);
          }}
          onRemove={() => {
            setModels(value.modelIds.filter((_, j) => j !== selected));
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      <Recolours value={value} onChange={onChange} />

      <div>
        <button className="btn-ghost btn-sm" onClick={() => setRaw((v) => !v)}>
          <Icon name={raw ? "up" : "down"} size={13} /> Raw ids (paste / copy)
        </button>
        {raw && (
          <div className="stack-sm" style={{ marginTop: 6 }}>
            <RawList label="Model ids" values={value.modelIds} onChange={(modelIds) => onChange({ ...value, modelIds })} />
            <RawList label="Recolour find" values={value.recolorFind} onChange={(recolorFind) => onChange({ ...value, recolorFind })} />
            <RawList
              label="Recolour replace"
              values={value.recolorReplace}
              onChange={(recolorReplace) => onChange({ ...value, recolorReplace })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PartEditor({
  modelId,
  part,
  appearance,
  onReplace,
  onRemove,
  onClose,
}: {
  modelId: number;
  part: ModelPart | null;
  appearance: Appearance;
  onReplace: (models: number[]) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [idText, setIdText] = useState(String(modelId));
  const [kits, setKits] = useState<KitSummary[] | null>(null);

  useEffect(() => setIdText(String(modelId)), [modelId]);

  useEffect(() => {
    if (!part) {
      setKits(null);
      return;
    }
    let alive = true;
    api
      .kitsByBodyPart(part.bodyPartId)
      .then((k) => alive && setKits(k))
      .catch(() => alive && setKits([]));
    return () => {
      alive = false;
    };
  }, [part?.bodyPartId]);

  const applyId = () => {
    const n = Number(idText);
    if (Number.isInteger(n) && n >= 0) onReplace([n]);
  };

  return (
    <div className="card card-pad stack-sm" style={{ background: "var(--surface-2)" }}>
      <div className="row">
        <div className="thumb" style={{ width: 96, height: 96 }}>
          <ModelThumb modelIds={[modelId]} recolorFind={appearance.recolorFind} recolorReplace={appearance.recolorReplace} size={96} />
        </div>
        <div className="stack-sm" style={{ flex: 1 }}>
          <strong>
            {part ? part.name : "Model"} <span className="mono faint">#{modelId}</span>
          </strong>
          <div className="row-tight">
            <input
              type="number"
              min={0}
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyId()}
              style={{ width: 110 }}
              aria-label="Model id"
            />
            <button className="btn-sm" onClick={applyId} disabled={idText === String(modelId)}>
              Set id
            </button>
          </div>
          <div className="row-tight">
            <button className="btn-sm btn-danger" onClick={onRemove}>
              <Icon name="trash" size={13} /> Remove part
            </button>
            <button className="btn-sm btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>

      {part ? (
        <>
          <div className="xsmall muted">Swap for another {part.name.toLowerCase()} (keeps your recolours):</div>
          {!kits ? (
            <div className="spinner" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {kits
                .filter((k) => !k.nonSelectable)
                .map((kit) => {
                  const current = kit.models.includes(modelId);
                  return (
                    <button
                      key={kit.id}
                      className={current ? "is-active" : ""}
                      onClick={() => onReplace(kit.models)}
                      title={`Kit ${kit.id}: models ${kit.models.join(", ")}`}
                      style={{ padding: 4, height: "auto" }}
                    >
                      <ModelThumb
                        modelIds={kit.models}
                        recolorFind={appearance.recolorFind}
                        recolorReplace={appearance.recolorReplace}
                        size={64}
                      />
                    </button>
                  );
                })}
            </div>
          )}
        </>
      ) : (
        <div className="xsmall faint">
          This model isn't part of a player kit (it's from an NPC, object or item), so there's no list to swap from. Change the
          id above, or use “Clone an entity” to pick a whole new look.
        </div>
      )}
    </div>
  );
}

function Recolours({ value, onChange }: { value: Appearance; onChange: (next: Appearance) => void }) {
  const pairs = value.recolorFind.map((find, i) => ({ find, replace: value.recolorReplace[i] }));
  const mismatch = value.recolorFind.length !== value.recolorReplace.length;

  const update = (i: number, key: "find" | "replace", v: number) => {
    const find = [...value.recolorFind];
    const replace = [...value.recolorReplace];
    (key === "find" ? find : replace)[i] = v;
    onChange({ ...value, recolorFind: find, recolorReplace: replace });
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="field-label">Recolours ({pairs.length})</span>
        <span className="xsmall faint">Swaps one of the model's colours for another.</span>
      </div>
      {mismatch && (
        <div className="callout callout-warning xsmall" style={{ marginBottom: 6 }}>
          Find has {value.recolorFind.length} colours but replace has {value.recolorReplace.length}. Fix this in Raw ids.
        </div>
      )}
      <div className="stack-sm">
        {!mismatch &&
          pairs.map((p, i) => (
            <div key={i} className="row-tight">
              <ColourField value={p.find} onChange={(v) => update(i, "find", v)} label="Find" />
              <Icon name="back" size={14} className="faint" />
              <ColourField value={p.replace ?? 0} onChange={(v) => update(i, "replace", v)} label="Replace with" />
              <button
                className="btn-ghost btn-sm btn-icon"
                title="Remove recolour"
                onClick={() =>
                  onChange({
                    ...value,
                    recolorFind: value.recolorFind.filter((_, j) => j !== i),
                    recolorReplace: value.recolorReplace.filter((_, j) => j !== i),
                  })
                }
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        {!mismatch && (
          <button
            className="btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => onChange({ ...value, recolorFind: [...value.recolorFind, 0], recolorReplace: [...value.recolorReplace, 0] })}
          >
            <Icon name="plus" size={13} /> Add recolour
          </button>
        )}
      </div>
    </div>
  );
}

// A swatch you can click to pick a colour, next to the packed number the game stores.
function ColourField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="row-tight" title={`${label}: ${value}`} style={{ flex: 1 }}>
      <input
        type="color"
        value={jagexToHex(value)}
        onChange={(e) => onChange(hexToJagex(e.target.value))}
        style={{ width: 34, height: 30, padding: 2, cursor: "pointer" }}
        aria-label={`${label} colour`}
      />
      <input
        type="number"
        min={0}
        max={65535}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(65535, Number(e.target.value) || 0)))}
        className="mono"
        style={{ width: 84 }}
        aria-label={`${label} value`}
      />
    </label>
  );
}

function RawList({ label, values, onChange }: { label: string; values: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(values.join(", "));
  // Only resync from outside when the numbers actually differ, so typing "12, " isn't
  // immediately rewritten back to "12".
  const joined = values.join(",");
  useEffect(() => {
    setText((t) => (parse(t).join(",") === joined ? t : values.join(", ")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="mono"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
      />
    </label>
  );
}

function parse(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}
