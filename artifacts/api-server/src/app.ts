import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Middleware stack ──────────────────────────────────────────────────────────

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Root probes ───────────────────────────────────────────────────────────────

// GET / — Cloud Run startup probe
app.get("/", (_req, res) => {
  res.status(200).send("OK");
});

// GET /healthz — flat health endpoint
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── GET /api — Replit deployment health check ─────────────────────────────────
//
// This handler is registered DIRECTLY on the app, BEFORE the sub-router is
// mounted, so it short-circuits immediately without touching any router,
// auth middleware, or database code.
//
// MUST stay above `app.use("/api", router)`.
app.get("/api", (_req, res) => {
  res.status(200).json({ status: "ok", service: "chakri-api" });
});

// ── API sub-router ────────────────────────────────────────────────────────────

app.use("/api", router);

// ── Global error handler ──────────────────────────────────────────────────────
//
// Catches any synchronous throw or next(err) call from any middleware or route.
// Logs the full stack so the exact offending line is visible in Cloud Run logs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(
    { err, stack: err?.stack },
    "Unhandled Express error — returning 500",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "INTERNAL_ERROR", message: err?.message ?? "Unknown error" });
  }
});

export default app;
