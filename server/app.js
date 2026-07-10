import path from "node:path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import { getProjectRoot, isServerless } from "./paths.js";
import { flushToBlob, reloadFromBlob } from "./db.js";

export function createApp({ serveStatic = false } = {}) {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser(process.env.SESSION_SECRET || "rialo-latch"));

  // 在 Netlify 上，SQLite 存在 /tmp 且每个实例独立，故每个请求前从 Blobs 拉取最新数据，
  // 请求结束前把改动写回 Blobs，实现跨实例持久化。
  if (isServerless()) {
    app.use(async (req, res, next) => {
      try {
        await reloadFromBlob();
      } catch {
        // ignore, fall back to in-memory
      }
      const originalEnd = res.end;
      let flushed = false;
      res.end = function patchedEnd(...args) {
        if (flushed) return originalEnd.apply(this, args);
        flushed = true;
        flushToBlob()
          .catch(() => {})
          .finally(() => originalEnd.apply(this, args));
        return this;
      };
      next();
    });
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "rialo-latch" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api", apiRoutes);

  if (serveStatic) {
    const distDir = path.join(getProjectRoot(), "dist");
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"), (err) => {
        if (err) {
          res.status(200).type("html").send(`<!doctype html>
<html><body style="font-family:sans-serif;padding:2rem">
  <h1>rialo API is running</h1>
  <p>Frontend not built yet. Run <code>npm run build</code>.</p>
</body></html>`);
        }
      });
    });
  }

  return app;
}

export default createApp;
