import { Router } from "express";
import type { ScriptFile } from "@citizens-helper/shared/src/types.js";
import { deleteScript, listScripts, readScript, writeScript } from "../scriptRepo.js";

export const scriptsRouter = Router();

scriptsRouter.get("/scripts", async (_req, res) => {
  try {
    res.json(await listScripts());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

scriptsRouter.get("/scripts/:name", async (req, res) => {
  try {
    res.json(await readScript(req.params.name));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400;
    res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Create and update are the same call: the name is the identity, and writing is always a
// full-file replace (the plugin caches scripts by name at load time, so partial edits have
// no meaning).
scriptsRouter.put("/scripts/:name", async (req, res) => {
  try {
    res.json(await writeScript(req.params.name, req.body as ScriptFile));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

scriptsRouter.delete("/scripts/:name", async (req, res) => {
  try {
    await deleteScript(req.params.name);
    res.json({ deleted: req.params.name });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400;
    res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
