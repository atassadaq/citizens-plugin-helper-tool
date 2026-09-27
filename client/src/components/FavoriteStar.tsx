import type { FavoriteEntry } from "@citizens-helper/shared/src/types";
import { useFavorites } from "../favorites/FavoritesContext";

type Props = {
  entryKey: string;
  // Computed only on click, not on every render, since assembling a snapshot touches
  // fields the caller may not otherwise need to read.
  buildEntry: () => Omit<FavoriteEntry, "savedAt">;
  size?: number;
};

// Star toggle used on the Entity Browser grid/detail page and on citizen/scenery
// cards/editors. Always renders a filled or outline star; never a loading state -
// FavoritesContext.toggle is optimistic, so there's nothing to wait on here.
export function FavoriteStar({ entryKey, buildEntry, size = 16 }: Props) {
  const { isFavorite, toggle, error } = useFavorites();
  const active = isFavorite(entryKey);

  return (
    <button
      onClick={(e) => {
        // Every place this renders sits inside a larger clickable card/row - without
        // this, clicking the star would also fire the card's own onClick (select/navigate).
        e.stopPropagation();
        toggle(entryKey, buildEntry);
      }}
      title={error ?? (active ? "Remove from favorites" : "Add to favorites")}
      style={{
        border: "none",
        background: "none",
        cursor: "pointer",
        fontSize: size,
        color: active ? "var(--accent)" : "var(--text-faint)",
        lineHeight: 1,
        padding: 2,
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
