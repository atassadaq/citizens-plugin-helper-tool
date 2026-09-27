import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Size of an element, kept current with a ResizeObserver (for canvases and maps that need
 * explicit pixels). Returns a callback ref rather than a ref object, so it still attaches
 * when the element only mounts after a loading state.
 */
function useElementSize<T extends HTMLElement>(axis: "width" | "height", fallback: number) {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const v = Math.floor(entries[0].contentRect[axis]);
      if (v > 0) setSize(v);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, axis]);
  const ref = useCallback((node: T | null) => setEl(node), []);
  return [ref, size] as const;
}

export function useElementWidth<T extends HTMLElement>(fallback: number) {
  return useElementSize<T>("width", fallback);
}

export function useElementHeight<T extends HTMLElement>(fallback: number) {
  return useElementSize<T>("height", fallback);
}

/** Ctrl/Cmd+S. The handler is read through a ref so callers can pass a fresh closure each render. */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const handler = useRef(onSave);
  handler.current = onSave;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (enabled) handler.current();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}

/** Browser "leave site?" prompt while there are unsaved edits. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const listener = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
}
