import { memo, useEffect, useRef, useState } from "react";
import { getThumbnail, peekThumbnail, thumbKey } from "../three/thumbnailCache";

type Props = {
  modelIds: number[];
  recolorFind?: number[];
  recolorReplace?: number[];
  size?: number;
  alt?: string;
};

// Re-exported so existing importers (ModelPicker, ModelBrowser) keep working - the cache
// itself lives in three/thumbnailCache, shared with the Leaflet marker icons.
export { thumbKey };

/**
 * A rendered model snapshot. Rendering only starts once the thumbnail scrolls into view, so
 * long rosters and search grids don't queue hundreds of renders for rows nobody looks at.
 */
export const ModelThumb = memo(function ModelThumb({ modelIds, recolorFind = [], recolorReplace = [], size = 96, alt }: Props) {
  const key = thumbKey(modelIds, recolorFind, recolorReplace);
  const [thumb, setThumb] = useState<string | null>(() => peekThumbnail(modelIds, recolorFind, recolorReplace));
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const cached = peekThumbnail(modelIds, recolorFind, recolorReplace);
    if (cached) {
      setThumb(cached);
      setFailed(false);
      return;
    }
    setThumb(null);
    setFailed(false);
    if (modelIds.length === 0 || !visible) return;

    // Guarded because an in-flight render for a row whose models have since changed must
    // not overwrite the current one.
    let cancelled = false;
    getThumbnail(modelIds, recolorFind, recolorReplace)
      .then((dataUrl) => !cancelled && setThumb(dataUrl))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible]);

  return (
    <div ref={ref} className="thumb" style={{ width: size, height: size }} title={failed ? "Could not render this model" : undefined}>
      {thumb && <img src={thumb} width={size} height={size} alt={alt ?? ""} loading="lazy" decoding="async" />}
      {!thumb && !failed && modelIds.length > 0 && <div className="skeleton" style={{ width: "70%", height: "70%" }} />}
      {modelIds.length === 0 && <span className="xsmall faint">no model</span>}
      {failed && <span className="xsmall" style={{ color: "var(--danger)" }}>!</span>}
    </div>
  );
});
