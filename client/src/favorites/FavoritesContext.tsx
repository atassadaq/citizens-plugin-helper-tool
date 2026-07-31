import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types";
import { api } from "../api/client";

type FavoritesContextValue = {
  favorites: FavoriteEntry[];
  isFavorite: (key: string) => boolean;
  // `build` is only invoked when `key` is not currently a favorite (adding); toggling off
  // an existing favorite just removes it by key, no snapshot needed.
  toggle: (key: string, build: () => Omit<FavoriteEntry, "savedAt">) => Promise<void>;
  error: string | null;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listFavorites()
      .then(setFavorites)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const isFavorite = useCallback((key: string) => favorites.some((f) => f.key === key), [favorites]);

  const toggle = useCallback(
    async (key: string, build: () => Omit<FavoriteEntry, "savedAt">) => {
      setError(null);
      const wasFavorite = favorites.some((f) => f.key === key);
      const previous = favorites;

      if (wasFavorite) {
        setFavorites(favorites.filter((f) => f.key !== key));
        try {
          await api.removeFavorite(key);
        } catch (e) {
          setFavorites(previous);
          setError(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      const entry = build();
      // Optimistic add with a placeholder savedAt, replaced once the server responds with
      // the real one.
      setFavorites([...favorites, { ...entry, savedAt: new Date().toISOString() }]);
      try {
        const saved = await api.addFavorite(entry);
        setFavorites((current) => current.map((f) => (f.key === saved.key ? saved : f)));
      } catch (e) {
        setFavorites(previous);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [favorites],
  );

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggle, error }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return ctx;
}
