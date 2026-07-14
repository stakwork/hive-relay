import type { Server, Socket } from "socket.io";
import { logger } from "../logger.js";
import type { RosterEntry } from "../types.js";

/**
 * Org-canvas collaboration room. Same shape as the whiteboard room —
 * roster + join/leave + cursor presence. Pure relay: no persistence here
 * (durability lives in hive's Postgres).
 *
 * The room is derived from the JWT `resource` claim (`canvas:<id>`, where
 * `<id>` is the org's githubLogin). The server enforces the room from the
 * token, so a client can only join the canvas it was granted.
 */
const RESOURCE_PREFIX = "canvas:";

interface CanvasCursorPayload {
  cursor: { x: number; y: number } | null;
  color: string;
  /** The node id this collaborator has selected, if any. */
  selectedNodeId?: string | null;
  /** Which sub-canvas the cursor/selection is on ("" = root). The room is
   *  per-org, so peers filter to the ref they're currently viewing. */
  canvasRef?: string;
}

export function registerCanvas(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;

    // Not a canvas socket — let another room handler take it.
    if (!user.resource.startsWith(RESOURCE_PREFIX)) {
      return;
    }

    const canvasId = user.resource.slice(RESOURCE_PREFIX.length);
    const room = `canvas:${canvasId}`;

    socket.join(room);

    const me: RosterEntry = {
      odinguserId: user.userId,
      name: user.name,
      image: user.image ?? null,
      color: user.color ?? "#888",
      joinedAt: Date.now(),
      senderId: socket.id,
    };

    socket.to(room).emit("user:join", { user: me });

    // Send the newcomer the current roster (everyone already in the room).
    const sids = io.of("/").adapter.rooms.get(room);
    const roster: RosterEntry[] = [];
    if (sids) {
      for (const sid of sids) {
        if (sid === socket.id) continue;
        const peer = io.sockets.sockets.get(sid);
        if (!peer) continue;
        const u = peer.data.user;
        roster.push({
          odinguserId: u.userId,
          name: u.name,
          image: u.image ?? null,
          color: u.color ?? "#888",
          joinedAt: 0,
          senderId: peer.id,
        });
      }
    }
    socket.emit("room:roster", { collaborators: roster });

    logger.info({ canvasId, userId: user.userId, sid: socket.id }, "canvas joined");

    // Cursor + selection presence — broadcast to the room (echo-free).
    socket.on("cursor:update", (payload: CanvasCursorPayload) => {
      socket.to(room).emit("cursor:update", {
        senderId: socket.id,
        userId: user.userId,
        cursor: payload.cursor,
        color: payload.color,
        selectedNodeId: payload.selectedNodeId ?? null,
        canvasRef: payload.canvasRef ?? "",
        username: user.name,
      });
    });

    socket.on("disconnect", (reason) => {
      socket.to(room).emit("user:leave", {
        userId: user.userId,
        senderId: socket.id,
      });
      logger.info(
        { canvasId, userId: user.userId, sid: socket.id, reason },
        "canvas left",
      );
    });
  });
}
