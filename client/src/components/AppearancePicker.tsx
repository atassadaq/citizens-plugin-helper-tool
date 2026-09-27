import { useEffect, useState } from "react";
import type { EntityKind, EntitySummary, KitSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "./ModelThumb";
import { CsvArrayInput } from "./CsvArrayInput";

type Appearance = {
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
};

type Props = {
  value: Appearance;
  onChange: (next: Appearance) => void;
};

type Source = "clone" | "kits" | "raw";

// Cloning replaces the whole appearance (models AND recolours) because an NPC's recolours
// are meaningless applied to a different set of meshes - they reference palette indices
// that only exist in that NPC's own models.
function CloneSource({ onChange }: { onChange: (next: Appearance) => void }) {
  const [kind, setKind] = useState<EntityKind>("npc");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery), 250);
    return () => clearTimeout(t);
  }, [rawQuery]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    api
      .searchEntities(kind, { query, limit: 24 })
      .then((p) => {
        if (!cancelled) setResults(p.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, query]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as EntityKind)} style={{ padding: 4 }}>
          <option value="npc">NPC</option>
          <option value="object">Object</option>
          <option value="item">Item</option>
        </select>
        <input
          placeholder="Search by name or id..."
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          style={{ padding: 5, flex: 1 }}
        />
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p>}
      {!query.trim() && <p style={{ fontSize: 12, opacity: 0.6 }}>Type to search. Picking one replaces the models and recolours below.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {results.map((entity) => (
          <button
            key={entity.id}
            onClick={() =>
              onChange({
                modelIds: entity.modelIds,
                recolorFind: entity.recolorFind,
                recolorReplace: entity.recolorReplace,
              })
            }
            style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 6, width: 104, background: "var(--surface)", cursor: "pointer" }}
            title={`${entity.name ?? "(unnamed)"} #${entity.id}`}
          >
            <ModelThumb
              modelIds={entity.modelIds}
              recolorFind={entity.recolorFind}
              recolorReplace={entity.recolorReplace}
              size={88}
              alt={entity.name ?? ""}
            />
            <div style={{ fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
              {entity.name ?? `#${entity.id}`}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Kits append rather than replace: assembling a character means stacking a head, a torso,
// legs and so on into one modelIds array.
function KitSource({ value, onChange }: Props) {
  const [bodyParts, setBodyParts] = useState<{ bodyPartId: number; name: string }[]>([]);
  const [bodyPartId, setBodyPartId] = useState<number | null>(null);
  const [kits, setKits] = useState<KitSummary[] | null>(null);

  useEffect(() => {
    api.kitBodyParts().then((parts) => {
      setBodyParts(parts);
      setBodyPartId(parts.find((p) => p.name === "Torso")?.bodyPartId ?? parts[0]?.bodyPartId ?? null);
    });
  }, []);

  useEffect(() => {
    if (bodyPartId == null) return;
    setKits(null);
    api.kitsByBodyPart(bodyPartId).then(setKits);
  }, [bodyPartId]);

  return (
    <div>
      <select
        value={bodyPartId ?? ""}
        onChange={(e) => setBodyPartId(Number(e.target.value))}
        style={{ padding: 4, marginBottom: 8 }}
      >
        {bodyParts.map((p) => (
          <option key={p.bodyPartId} value={p.bodyPartId}>
            {p.name}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Only Head/Torso/Legs/Boots/Hair are confirmed-accurate labels - trust the picture over the name.
        Clicking adds that part's models to the list.
      </p>
      {!kits && <p style={{ fontSize: 12 }}>Loading...</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {kits?.map((kit) => (
          <button
            key={kit.id}
            onClick={() =>
              onChange({
                ...value,
                modelIds: [...value.modelIds, ...kit.models],
              })
            }
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 6,
              width: 104,
              background: "var(--surface)",
              cursor: "pointer",
              opacity: kit.nonSelectable ? 0.5 : 1,
            }}
          >
            <ModelThumb modelIds={kit.models} recolorFind={kit.recolorFind} recolorReplace={kit.recolorReplace} size={88} />
            <div style={{ fontSize: 11, marginTop: 4 }}>[{kit.models.join(",")}]</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearancePicker({ value, onChange }: Props) {
  const [source, setSource] = useState<Source>("clone");

  const SOURCES: { id: Source; label: string }[] = [
    { id: "clone", label: "Clone an entity" },
    { id: "kits", label: "Body parts" },
    { id: "raw", label: "Raw ids" },
  ];

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              background: source === s.id ? "var(--accent-soft)" : "var(--surface-2)",
              color: source === s.id ? "var(--accent)" : "inherit",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {source === "clone" && <CloneSource onChange={onChange} />}
      {source === "kits" && <KitSource value={value} onChange={onChange} />}
      {source === "raw" && (
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
          Edit the model id list directly below.
        </p>
      )}

      <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <CsvArrayInput
          label="Model ids"
          values={value.modelIds}
          onChange={(modelIds) => onChange({ ...value, modelIds })}
        />
        <CsvArrayInput
          label="Recolor find"
          values={value.recolorFind}
          onChange={(recolorFind) => onChange({ ...value, recolorFind })}
        />
        <CsvArrayInput
          label="Recolor replace"
          values={value.recolorReplace}
          onChange={(recolorReplace) => onChange({ ...value, recolorReplace })}
        />
      </div>
    </div>
  );
}
