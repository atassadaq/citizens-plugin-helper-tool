import { useEffect, useState } from "react";
import { getThumbnail, peekThumbnail, thumbKey } from "../three/thumbnailCache";

type Props = {
  modelIds: number[];
  recolorFind?: number[];
  recolorReplace?: number[];
  size?: number;
  alt?: string;
};

// Re-exported so existing importers (ModelPicker, ModelBrowser) keep working - the cache
// itself now lives in three/thumbnailCache, shared with the Leaflet marker icons.
export { thumbKey };

export function ModelThumb({ modelIds, recolorFind = [], recolorReplace = [], size = 96, alt }: Props) {
  const key = thumbKey(modelIds, recolorFind, recolorReplace);
  const [thumb, setThumb] = useState<string | null>(() => peekThumbnail(modelIds, recolorFind, recolorReplace));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = peekThumbnail(modelIds, recolorFind, recolorReplace);
    if (cached) {
      setThumb(cached);
      setFailed(false);
      return;
    }
    if (modelIds.length === 0) {
      return;
    }

    // Guarded because the grid re-renders as you type in the search box, and an in-flight
    // render for a row that's since scrolled away must not overwrite the current one.
    let cancelled = false;
    setThumb(null);
    setFailed(false);
    getThumbnail(modelIds, recolorFind, recolorReplace)
      .then((dataUrl) => {
        if (!cancelled) setThumb(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#f2f2f2",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {thumb && <img src={thumb} width={size} height={size} alt={alt ?? ""} />}
      {!thumb && !failed && modelIds.length > 0 && <span style={{ fontSize: 10, opacity: 0.5 }}>...</span>}
      {modelIds.length === 0 && <span style={{ fontSize: 10, opacity: 0.5 }}>no model</span>}
      {failed && <span style={{ fontSize: 10, color: "crimson" }}>failed</span>}
    </div>
  );
}
