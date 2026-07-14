import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { authMiddleware } from "./auth.js";
import { logger } from "./logger.js";
import { registerWhiteboard } from "./rooms/whiteboard.js";
import { registerCanvas } from "./rooms/canvas.js";

const PORT = Number(process.env.PORT ?? 3333);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, credentials: true },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

io.use(authMiddleware);
registerWhiteboard(io);
registerCanvas(io);

// Fallback: disconnect any socket whose resource matches no known room
// type (each room handler above ignores non-matching resources).
io.on("connection", (socket) => {
  const resource: string = socket.data.user?.resource ?? "";
  if (!resource.startsWith("whiteboard:") && !resource.startsWith("canvas:")) {
    socket.disconnect(true);
  }
});

httpServer.listen(PORT, () => {
  logger.info({ port: PORT, cors: CORS_ORIGIN }, "hive-relay listening");
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "shutting down");
    io.close(() => httpServer.close(() => process.exit(0)));
  });
}
