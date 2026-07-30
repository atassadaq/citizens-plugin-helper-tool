import { useEffect, useState } from "react";
import type { CitizenInfo, CitizenRegionFile } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";
import { CsvArrayInput } from "../components/CsvArrayInput";
import { LiveViewer } from "../three/LiveViewer";

type Props = {
  regionId: number;
  uuid: string;
  onBack: () => void;
};

export function CitizenEditorView({ regionId, uuid, onBack }: Props) {
  const [region, setRegion] = useState<CitizenRegionFile | null>(null);
  const [draft, setDraft] = useState<CitizenInfo | null>(null);
  const [gltfText, setGltfText] = useState<string | null>(null);
  // Fatal: the citizen couldn't be loaded at all - nothing to show.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Non-fatal: a live-preview render attempt failed (e.g. transient bad model id
  // while typing) - shown inline, never hides the editor itself.
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRegion(regionId)
      .then((r) => {
        setRegion(r);
        const citizen = r.citizenRoster.find((c) => c.uuid === uuid) ?? null;
        if (!citizen) {
          setLoadError(`Citizen ${uuid} not found in region ${regionId}`);
          return;
        }
        setDraft(citizen);
      })
      .catch((e) => setLoadError(e.message));
  }, [regionId, uuid]);

  const recolorMismatch = !!draft && (draft.modelRecolorFind?.length ?? 0) !== (draft.modelRecolorReplace?.length ?? 0);

  // Debounced live preview: re-render whenever the draft model/recolor arrays change.
  // Skipped entirely while the two recolor arrays are momentarily out of sync (e.g.
  // mid-edit, before the user finishes typing the second field) rather than sending
  // an invalid request and surfacing a server error for a transient, expected state.
  useEffect(() => {
    if (!draft || recolorMismatch) return;
    const handle = setTimeout(() => {
      api
        .render({
          modelIds: draft.modelIds,
          recolorFind: draft.modelRecolorFind ?? [],
          recolorReplace: draft.modelRecolorReplace ?? [],
        })
        .then((gltf) => {
          setGltfText(gltf);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(e.message));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.modelIds, draft?.modelRecolorFind, draft?.modelRecolorReplace, recolorMismatch]);

  if (loadError) {
    return (
      <div>
        <button onClick={onBack}>&larr; Back to region {regionId}</button>
        <p style={{ color: "crimson" }}>{loadError}</p>
      </div>
    );
  }
  if (!region || !draft) return <p>Loading citizen...</p>;

  const canSave = draft.modelIds.length > 0 && !recolorMismatch;

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    try {
      await api.saveCitizen(regionId, uuid, draft!);
      setSaveState("saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState("error");
    }
  }

  return (
    <div>
      <button onClick={onBack}>&larr; Back to region {regionId}</button>
      <h2>{draft.name}</h2>
      <p style={{ opacity: 0.7 }}>{draft.examineText}</p>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: "0 0 auto" }}>
          <LiveViewer gltfText={gltfText} />
          {previewError && <p style={{ color: "crimson", fontSize: 13 }}>{previewError}</p>}
        </div>

        <div style={{ flex: 1 }}>
          <CsvArrayInput
            label="Model IDs"
            values={draft.modelIds}
            onChange={(modelIds) => setDraft({ ...draft, modelIds })}
          />
          <CsvArrayInput
            label="Recolor find"
            values={draft.modelRecolorFind ?? []}
            onChange={(modelRecolorFind) => setDraft({ ...draft, modelRecolorFind })}
          />
          <CsvArrayInput
            label="Recolor replace"
            values={draft.modelRecolorReplace ?? []}
            onChange={(modelRecolorReplace) => setDraft({ ...draft, modelRecolorReplace })}
          />
          {recolorMismatch && (
            <p style={{ color: "crimson", fontSize: 13 }}>
              Recolor find/replace arrays must be the same length.
            </p>
          )}

          <button onClick={handleSave} disabled={!canSave || saveState === "saving"}>
            {saveState === "saving" ? "Saving..." : "Save"}
          </button>
          {saveState === "saved" && <span style={{ marginLeft: 8, color: "green" }}>Saved.</span>}
          {saveError && <p style={{ color: "crimson", fontSize: 13 }}>{saveError}</p>}
        </div>
      </div>
    </div>
  );
}
