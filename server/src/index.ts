import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { cacheReady } from "./rsCache.js";
import { statusRouter } from "./routes/status.js";
import { regionsRouter } from "./routes/regions.js";
import { renderRouter } from "./routes/render.js";
import { kitsRouter } from "./routes/kits.js";
import { entitiesRouter } from "./routes/entities.js";
import { scriptsRouter } from "./routes/scripts.js";
import { favoritesRouter } from "./routes/favorites.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api", statusRouter);
app.use("/api", regionsRouter);
app.use("/api", renderRouter);
app.use("/api", kitsRouter);
app.use("/api", entitiesRouter);
app.use("/api", scriptsRouter);
app.use("/api", favoritesRouter);

async function main() {
  console.log("Loading OSRS game cache...");
  await cacheReady;
  console.log("Cache ready.");

  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
