import { Router } from "express";
import { getEntity, isEntityKind, searchEntities } from "../entityCatalog.js";

export const entitiesRouter = Router();

// GET /api/entities/:kind?query=&offset=&limit=&includeModelless=
// Paginated because the object catalog alone is 62k entries - the client renders a
// thumbnail per visible row, and rendering all of them at once is not survivable.
entitiesRouter.get("/entities/:kind", async (req, res) => {
  const kind = req.params.kind;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unknown entity kind '${kind}' (expected npc, object or item)` });
    return;
  }

  const offset = req.query.offset == null ? undefined : Number(req.query.offset);
  const limit = req.query.limit == null ? undefined : Number(req.query.limit);
  if ((offset != null && !Number.isFinite(offset)) || (limit != null && !Number.isFinite(limit))) {
    res.status(400).json({ error: "offset and limit must be numbers" });
    return;
  }

  try {
    res.json(
      await searchEntities(kind, {
        query: typeof req.query.query === "string" ? req.query.query : undefined,
        offset,
        limit,
        includeModelless: req.query.includeModelless === "true",
      }),
    );
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

entitiesRouter.get("/entities/:kind/:id", async (req, res) => {
  const kind = req.params.kind;
  if (!isEntityKind(kind)) {
    res.status(400).json({ error: `Unknown entity kind '${kind}' (expected npc, object or item)` });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 0) {
    res.status(400).json({ error: "id must be a non-negative integer" });
    return;
  }

  try {
    const entity = await getEntity(kind, id);
    if (!entity) {
      res.status(404).json({ error: `No ${kind} with id ${id}` });
      return;
    }
    res.json(entity);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
