import { useEffect, useMemo, useState } from "react";
import type { EntityDetail, EntityKind } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { ModelThumb } from "../components/ModelThumb";
import { FavoriteStar } from "../components/FavoriteStar";
import { LiveViewer } from "../three/LiveViewer";

type Props = {
  kind: EntityKind;
  id: number;
  onBack: () => void;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      style={{ fontSize: 12, padding: "3px 8px" }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function EntityDetailView({ kind, id, onBack }: Props) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  // Which component models are included in the composed preview. Toggling one off is how
  // you work out which mesh is which - the whole point of the per-component breakdown.
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  useEffect(() => {
    setEntity(null);
    setError(null);
    setVariantIndex(0);
    setHidden(new Set());
    api
      .getEntity(kind, id)
      .then(setEntity)
      .catch((e) => setError(e.message));
  }, [kind, id]);

  const variant = entity?.variants[variantIndex];
  const visibleModelIds = useMemo(
    () => (variant?.modelIds ?? []).filter((_, i) => !hidden.has(i)),
    [variant, hidden],
  );

  const [gltf, setGltf] = useState<string | null>(null);
  useEffect(() => {
    if (!entity || visibleModelIds.length === 0) {
      setGltf(null);
      return;
    }
    let cancelled = false;
    api
      .render({
        modelIds: visibleModelIds,
        recolorFind: entity.recolorFind,
        recolorReplace: entity.recolorReplace,
      })
      .then((text) => {
        if (!cancelled) setGltf(text);
      })
      .catch(() => {
        if (!cancelled) setGltf(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, visibleModelIds]);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!entity) return <p>Loading...</p>;

  const allIds = variant?.modelIds ?? [];

  return (
    <div>
      <button onClick={onBack}>&larr; Back to browser</button>

      <h2 style={{ marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
        {entity.name ?? <span style={{ opacity: 0.6 }}>(unnamed)</span>}{" "}
        <span style={{ fontSize: 14, opacity: 0.6, fontWeight: "normal" }}>
          {kind} #{entity.id}
        </span>
        <FavoriteStar
          entryKey={`${kind}:${entity.id}`}
          buildEntry={() => {
            const animations: Record<string, string | number> = {};
            if (entity.standingAnimation != null && entity.standingAnimation >= 0) {
              animations.standing = entity.standingAnimation;
            }
            if (entity.walkingAnimation != null && entity.walkingAnimation >= 0) {
              animations.walking = entity.walkingAnimation;
            }
            return {
              key: `${kind}:${entity.id}`,
              kind,
              sourceLabel: `${kind} #${entity.id}`,
              name: entity.name,
              modelIds: entity.modelIds,
              recolorFind: entity.recolorFind,
              recolorReplace: entity.recolorReplace,
              animations,
            };
          }}
        />
      </h2>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
        {entity.combatLevel != null && entity.combatLevel > 0 && <>Combat {entity.combatLevel} &middot; </>}
        {entity.size != null && <>Size {entity.size} &middot; </>}
        {entity.standingAnimation != null && entity.standingAnimation >= 0 && (
          <>Idle anim {entity.standingAnimation} &middot; </>
        )}
        {entity.walkingAnimation != null && entity.walkingAnimation >= 0 && (
          <>Walk anim {entity.walkingAnimation} &middot; </>
        )}
        {entity.actions && entity.actions.length > 0 && <>Actions: {entity.actions.join(", ")}</>}
      </div>

      {entity.truncatedAtOpcode != null && (
        <p style={{ fontSize: 12, color: "#8a6d00", background: "#fff8e1", padding: 8, borderRadius: 4 }}>
          This cache record used opcode {entity.truncatedAtOpcode}, which the bundled cache reader doesn't
          understand, so parsing stopped early - some fields below may be missing. The models shown are still
          the ones that were read successfully.
        </p>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ width: 320, height: 320, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            {gltf ? (
              <LiveViewer gltfText={gltf} width={320} height={320} />
            ) : (
              <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12, opacity: 0.6 }}>
                {visibleModelIds.length === 0 ? "All models hidden" : "Loading preview..."}
              </div>
            )}
          </div>

          {entity.variants.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {entity.variants.map((v, i) => (
                <button
                  key={v.label}
                  onClick={() => {
                    setVariantIndex(i);
                    setHidden(new Set());
                  }}
                  disabled={i === variantIndex}
                  style={{ fontSize: 12 }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
            <CopyButton text={allIds.join(",")} label="Copy all model ids" />
            {hidden.size > 0 && (
              <button onClick={() => setHidden(new Set())} style={{ fontSize: 12 }}>
                Show all
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6, maxWidth: 320 }}>
            [{allIds.join(", ")}]
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          <h3 style={{ fontSize: 14, marginTop: 0 }}>
            Component models{variant ? ` - ${variant.label}` : ""}
          </h3>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>
            Each mesh that makes up this {kind}, rendered on its own. Click one to hide it from the preview so
            you can tell which part is which. Recolours from the {kind} are applied to every part.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {allIds.map((modelId, index) => {
              const isHidden = hidden.has(index);
              return (
                <div
                  key={`${modelId}-${index}`}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    padding: 6,
                    width: 104,
                    textAlign: "center",
                    opacity: isHidden ? 0.35 : 1,
                    background: isHidden ? "#f6f6f6" : "white",
                  }}
                >
                  <button
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                    style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
                    title={isHidden ? "Show in preview" : "Hide from preview"}
                  >
                    <ModelThumb
                      modelIds={[modelId]}
                      recolorFind={entity.recolorFind}
                      recolorReplace={entity.recolorReplace}
                      size={88}
                      alt={`model ${modelId}`}
                    />
                  </button>
                  <div style={{ fontSize: 11, marginTop: 4 }}>{modelId}</div>
                  <CopyButton text={String(modelId)} label="Copy" />
                </div>
              );
            })}
          </div>

          {entity.objectTypes && entity.objectTypes.length > 0 && (
            <p style={{ fontSize: 11, opacity: 0.7, marginTop: 10 }}>
              Object orientation types (parallel to the ids above): [{entity.objectTypes.join(", ")}]
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
