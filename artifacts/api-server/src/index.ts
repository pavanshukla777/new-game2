import { createServer } from "node:http";
import app from "./app";
import { initSocketIO } from "./socket/index";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 3001);

// Create a plain HTTP server so both Express and Socket.IO share the same port
const httpServer = createServer(app);

// Attach Socket.IO (/lobby and /game namespaces)
initSocketIO(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Bundelkhandi Chhakri API server listening");
  logger.info("Socket.IO ready on /lobby and /game namespaces");
});

httpServer.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});
