import { Link } from "react-router-dom";

export type EntityTab = "npc" | "object" | "item" | "citizens";

const TABS: { id: EntityTab; label: string }[] = [
  { id: "citizens", label: "Our citizens" },
  { id: "npc", label: "NPCs" },
  { id: "object", label: "Objects" },
  { id: "item", label: "Items" },
];

/** Tab strip shared by the game-catalog browser and the citizens browser. */
export function EntityTabs({ active }: { active: EntityTab }) {
  return (
    <nav className="segmented" aria-label="Entity type">
      {TABS.map((t) => (
        <Link
          key={t.id}
          to={`/entities/${t.id}`}
          className={`btn${t.id === active ? " is-active" : ""}`}
          aria-current={t.id === active ? "page" : undefined}
          style={{ border: "none", minHeight: 26, padding: "3px 12px", textDecoration: "none" }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
