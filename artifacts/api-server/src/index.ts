import { createServer } from "node:http";
import app from "./app";
import { initSocketIO } from "./socket/index";
import { logger } from "./lib/logger";

// Catch every unhandled exception so the full stack trace is visible in logs
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — shutting down");
  process.exit(1);
});

const port = Number(process.env.PORT ?? 3001);

const httpServer = createServer(app);

// Start listening first so the startup probe can get a 200 immediately
httpServer.listen(port, () => {
  logger.info({ port }, "Bundelkhandi Chhakri API server listening");

  // Attach Socket.IO after listen so the HTTP server is already bound
  initSocketIO(httpServer);
  logger.info("Socket.IO ready on /lobby and /game namespaces");
});

httpServer.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});
