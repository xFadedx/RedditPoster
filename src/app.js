import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authRoutes from "./routes/authRoutes.js";
import generateRoutes from "./routes/generateRoutes.js";
import draftRoutes from "./routes/draftRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(publicDir));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api", authRoutes);
  app.use("/api", generateRoutes);
  app.use("/api", draftRoutes);

  app.use((error, _request, response, _next) => {
    const status = error.status || 500;
    response.status(status).json({
      error: error.message || "Unexpected server error."
    });
  });

  return app;
}
