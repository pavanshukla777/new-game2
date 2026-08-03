import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import roomsRouter from "./rooms";
import gamesRouter from "./games";
import usersRouter from "./users";

const router = Router();

router.use("/healthz", healthRouter);
router.use("/auth", authRouter);
router.use("/rooms", roomsRouter);
router.use("/games", gamesRouter);
router.use("/users", usersRouter);

export default router;
