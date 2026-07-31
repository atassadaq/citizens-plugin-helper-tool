import type { ClipInfo } from "../three/LiveViewer";

export type PreviewAnim = "idle" | "move" | "none";

type Props = {
  previewAnim: PreviewAnim;
  onPreviewAnimChange: (next: PreviewAnim) => void;
  // Enum names off the citizen, shown so it's obvious which animation each tab plays.
  idleAnimation: string | null;
  moveAnimation: string | null;
  clip: ClipInfo | null;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  // null means "follow playback"; a number holds that frame.
  frameIndex: number | null;
  onFrameIndexChange: (index: number | null) => void;
};

const SPEEDS = [0.25, 0.5, 1];

export function AnimationControls({
  previewAnim,
  onPreviewAnimChange,
  idleAnimation,
  moveAnimation,
  clip,
  paused,
  onPausedChange,
  timeScale,
  onTimeScaleChange,
  frameIndex,
  onFrameIndexChange,
}: Props) {
  const tabs: { id: PreviewAnim; label: string; anim: string | null }[] = [
    { id: "idle", label: "Idle", anim: idleAnimation },
    { id: "move", label: "Move", anim: moveAnimation },
    { id: "none", label: "Static", anim: null },
  ];

  const selected = tabs.find((t) => t.id === previewAnim);
  // "Selected but unset" and "deliberately static" are different states worth telling
  // apart: the first means the citizen has no animation of that kind at all.
  const missingName = previewAnim !== "none" && !selected?.anim;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onPreviewAnimChange(tab.id)}
            title={tab.anim ?? undefined}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              background: previewAnim === tab.id ? "#4a90e2" : "#eee",
              color: previewAnim === tab.id ? "white" : "inherit",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        {selected?.anim && <span style={{ fontSize: 11, opacity: 0.7 }}>{selected.anim}</span>}
      </div>

      {missingName && (
        <p style={{ fontSize: 11, opacity: 0.7, margin: "6px 0 0" }}>
          This citizen has no {previewAnim} animation set.
        </p>
      )}

      {previewAnim !== "none" && !missingName && !clip && (
        <p style={{ fontSize: 11, color: "#8a6d00", margin: "6px 0 0" }}>
          No animation data for these models &mdash; the meshes have no vertex groups to pose, so the plugin will
          render them static too.
        </p>
      )}

      {clip && previewAnim !== "none" && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                // Resuming from a held frame has to release the scrub, or the seek
                // effect would keep yanking playback back to it.
                if (paused) onFrameIndexChange(null);
                onPausedChange(!paused);
              }}
              style={{ fontSize: 12, padding: "3px 10px", cursor: "pointer" }}
            >
              {paused ? "▶ Play" : "⏸ Pause"}
            </button>
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => onTimeScaleChange(speed)}
                style={{
                  fontSize: 11,
                  padding: "3px 7px",
                  background: timeScale === speed ? "#ddd" : "transparent",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {speed}&times;
              </button>
            ))}
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {clip.frameCount} frames &middot; {clip.duration.toFixed(2)}s
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input
              type="range"
              min={0}
              max={Math.max(0, clip.frameCount - 1)}
              step={1}
              value={frameIndex ?? 0}
              onChange={(e) => {
                onPausedChange(true);
                onFrameIndexChange(Number(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, opacity: 0.7, minWidth: 62, textAlign: "right" }}>
              {frameIndex == null ? "live" : `frame ${frameIndex + 1}/${clip.frameCount}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
