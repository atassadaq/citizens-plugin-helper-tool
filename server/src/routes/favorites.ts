import { Router } from "express";
import type { FavoriteEntry } from "@citizens-helper/shared/src/types.js";
import { addFavorite, listFavorites, removeFavorite } from "../favoritesRepo.js";

export const favoritesRouter = Router();

favoritesRouter.get("/favorites", async (_req, res) => {
  try {
    res.json(await listFavorites());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

favoritesRouter.post("/favorites", async (req, res) => {
  try {
    res.json(await addFavorite(req.body as Omit<FavoriteEntry, "savedAt">));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Express decodes URL-encoded path segments before populating req.params, so a key like
// "citizen:12086:41c4f935-..." (no special characters needing escaping) or a
// %3A-encoded one both arrive here already decoded - no manual decodeURIComponent needed
// (matching routes/scripts.ts's :name param, which also uses req.params directly).
favoritesRouter.delete("/favorites/:key", async (req, res) => {
  try {
    await removeFavorite(req.params.key);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
