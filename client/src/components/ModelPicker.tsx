import { useEffect, useState } from "react";
import { api } from "../api/client";
import { renderThumbnail } from "../three/thumbnailRenderer";

type Props = {
  modelIds: number[];
  recolorFind: number[];
  recolorReplace: number[];
  onChange: (modelIds: number[]) => void;
};

// Keyed by model id + recolor combo so identical sub-models across different
// citizens/slots don't each pay for their own render.
const thumbCache = new Map<string, string>();

function thumbKey(id: number, recolorFind: number[], recolorReplace: number[]): string {
  return `${id}|${recolorFind.join(",")}|${recolorReplace.join(",")}`;
}

function ModelThumb({
  id,
  recolorFind,
  recolorReplace,
}: {
  id: number;
  recolorFind: number[];
  recolorReplace: number[];
}) {
  const key = thumbKey(id, recolorFind, recolorReplace);
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(key) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = thumbCache.get(key);
    if (cached) {
      setThumb(cached);
      setFailed(false);
      return;
    }
    setThumb(null);
    setFailed(false);
    let cancelled = false;
    api
      .render({ modelIds: [id], recolorFind, recolorReplace })
      .then((gltf) => renderThumbnail(gltf))
      .then((dataUrl) => {
        if (cancelled) return;
        thumbCache.set(key, dataUrl);
        setThumb(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (failed) return <span style={{ fontSize: 10, color: "crimson" }}>bad id</span>;
  if (!thumb) return <span style={{ fontSize: 10, opacity: 0.5 }}>...</span>;
  return <img src={thumb} width={64} height={64} alt={`model ${id}`} />;
}

// Replaces the old CSV-of-ints text field for model ids: every sub-model in the
// entity gets its own thumbnail button so a model id can be visually identified
// instead of guessed from a bare number. Clicking a thumbnail opens a small
// inline editor to swap that slot's model id.
export function ModelPicker({ modelIds, recolorFind, recolorReplace, onChange }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditValue(String(modelIds[index]));
  }

  function commitEdit() {
    if (editingIndex === null) return;
    const parsed = Number(editValue);
    if (Number.isFinite(parsed)) {
      const next = [...modelIds];
      next[editingIndex] = parsed;
      onChange(next);
    }
    setEditingIndex(null);
  }

  function removeModel(index: number) {
    if (modelIds.length <= 1) return;
    if (editingIndex === index) setEditingIndex(null);
    onChange(modelIds.filter((_, i) => i !== index));
  }

  function addModel() {
    onChange([...modelIds, 0]);
    setEditingIndex(modelIds.length);
    setEditValue("0");
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Models</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {modelIds.map((id, index) => (
          <div key={index} style={{ position: "relative", width: 68 }}>
            <button
              onClick={() => startEdit(index)}
              title={`Model ${id} - click to change`}
              style={{
                width: 68,
                height: 68,
                padding: 0,
                border: editingIndex === index ? "2px solid #4a90e2" : "1px solid #ccc",
                borderRadius: 6,
                background: "#f2f2f2",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <ModelThumb id={id} recolorFind={recolorFind} recolorReplace={recolorReplace} />
            </button>
            {modelIds.length > 1 && (
              <button
                onClick={() => removeModel(index)}
                title="Remove model"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 11,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                &times;
              </button>
            )}
            <div style={{ fontSize: 10, textAlign: "center", marginTop: 2, opacity: 0.7 }}>{id}</div>

            {editingIndex === index && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 10,
                  background: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  padding: 6,
                  marginTop: 4,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                }}
              >
                <input
                  autoFocus
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingIndex(null);
                  }}
                  style={{ width: 70 }}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button onClick={commitEdit}>Apply</button>
                  <button onClick={() => setEditingIndex(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={addModel}
          title="Add model"
          style={{
            width: 68,
            height: 68,
            border: "1px dashed #999",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            fontSize: 22,
            color: "#999",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
