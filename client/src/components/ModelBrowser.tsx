import { useEffect, useState } from "react";
import type { KitSummary } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { renderThumbnail } from "../three/thumbnailRenderer";

type Props = {
  onBack: () => void;
};

// Keyed by the kit's own models+recolor combo, same idea as ModelPicker's thumbCache.
const thumbCache = new Map<string, string>();

function kitKey(kit: KitSummary): string {
  return `${kit.models.join(",")}|${kit.recolorFind.join(",")}|${kit.recolorReplace.join(",")}`;
}

function KitCard({ kit }: { kit: KitSummary }) {
  const key = kitKey(kit);
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (thumbCache.has(key)) return;
    let cancelled = false;
    api
      .render({ modelIds: kit.models, recolorFind: kit.recolorFind, recolorReplace: kit.recolorReplace })
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

  function copyIds() {
    navigator.clipboard.writeText(kit.models.join(",")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 8,
        width: 140,
        textAlign: "center",
        opacity: kit.nonSelectable ? 0.5 : 1,
      }}
      title={kit.nonSelectable ? "Not selectable in-game (may still be a usable model)" : undefined}
    >
      <div
        style={{
          width: 128,
          height: 128,
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        {thumb && <img src={thumb} width={128} height={128} alt={`kit ${kit.id}`} />}
        {!thumb && !failed && <span style={{ fontSize: 11, opacity: 0.5 }}>loading...</span>}
        {failed && <span style={{ fontSize: 11, color: "var(--danger)" }}>render failed</span>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>[{kit.models.join(", ")}]</div>
      <button onClick={copyIds} style={{ fontSize: 11, padding: "2px 6px" }}>
        {copied ? "Copied!" : "Copy model ids"}
      </button>
    </div>
  );
}

export function ModelBrowser({ onBack }: Props) {
  const [bodyParts, setBodyParts] = useState<{ bodyPartId: number; name: string }[] | null>(null);
  const [bodyPartId, setBodyPartId] = useState<number | null>(null);
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .kitBodyParts()
      .then((parts) => {
        setBodyParts(parts);
        const torso = parts.find((p) => p.name === "Torso");
        setBodyPartId(torso ? torso.bodyPartId : (parts[0]?.bodyPartId ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (bodyPartId == null) return;
    setKits(null);
    api
      .kitsByBodyPart(bodyPartId)
      .then(setKits)
      .catch((e) => setError(e.message));
  }, [bodyPartId]);

  return (
    <div>
      <button onClick={onBack}>&larr; Back</button>
      <h2>Model Browser</h2>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        Browse OSRS character-creation body parts to find replacement model ids. Click a thumbnail's "Copy model
        ids" to grab the numbers, then paste them into a citizen's model slots. Only Head/Torso/Legs/Boots/Hair are
        confirmed-accurate labels - the rest ("Group N") are unverified, so trust the picture over the name.
      </p>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {bodyParts && (
        <select
          value={bodyPartId ?? ""}
          onChange={(e) => setBodyPartId(Number(e.target.value))}
          style={{ marginBottom: 16, padding: 4 }}
        >
          {bodyParts.map((part) => (
            <option key={part.bodyPartId} value={part.bodyPartId}>
              {part.name}
            </option>
          ))}
        </select>
      )}

      {!kits && !error && <p>Loading...</p>}
      {kits && kits.length === 0 && <p>No models found for this body part.</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {kits?.map((kit) => <KitCard key={kit.id} kit={kit} />)}
      </div>
    </div>
  );
}
