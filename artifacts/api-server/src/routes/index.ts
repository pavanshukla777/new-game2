import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import roomsRouter from "./rooms";
import gamesRouter from "./games";
import usersRouter from "./users";

const router = Router();

// Root of /api — Replit deployment health check hits GET /api.
// Must return 200 immediately, no auth or DB access.
router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "chakri-api" });
});

router.use("/healthz", healthRouter);
router.use("/auth", authRouter);
router.use("/rooms", roomsRouter);
router.use("/games", gamesRouter);
router.use("/users", usersRouter);

export default router;
