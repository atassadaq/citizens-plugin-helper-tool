// A handful of inline stroke icons, so the shell doesn't pull in an icon library for ~15 glyphs.
const PATHS = {
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  cube: "M12 2 3 7v10l9 5 9-5V7l-9-5zm0 0v20M3 7l9 5 9-5",
  shirt: "M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z",
  script: "M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7m1-16a2 2 0 0 0-2 2v2h3M8 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-1m6-8h4m-4 4h4",
  plus: "M12 5v14M5 12h14",
  back: "M15 18l-6-6 6-6",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  save: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  tree: "M12 22v-6m0 0-5 0 5-7-4 0 4-6 4 6-4 0 5 7z",
  walk: "M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 21l2-6 2 2v5m-3-11 2-3 3 2 2 3m-7-2-2 4",
  chat: "M4 5h16v11H9l-5 4z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4l3 2",
  film: "M4 4h16v16H4zM8 4v16m8-16v16M4 8h4m-4 8h4m8-8h4m-4 8h4",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  x: "M6 6l12 12M18 6 6 18",
  external: "M14 4h6v6m0-6-9 9M18 14v6H4V6h6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
