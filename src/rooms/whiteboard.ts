import type { Server, Socket } from "socket.io";
import { logger } from "../logger.js";
import type {
  CursorUpdatePayload,
  ElementsUpdatePayload,
  RosterEntry,
} from "../types.js";

const RESOURCE_PREFIX = "whiteboard:";

export function registerWhiteboard(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;

    if (!user.resource.startsWith(RESOURCE_PREFIX)) {
      socket.disconnect(true);
      return;
    }

    const whiteboardId = user.resource.slice(RESOURCE_PREFIX.length);
    const room = `whiteboard:${whiteboardId}`;

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

    logger.info(
      { whiteboardId, userId: user.userId, sid: socket.id },
      "joined",
    );

    socket.on("elements:update", (payload: ElementsUpdatePayload) => {
      socket.to(room).emit("elements:update", {
        senderId: socket.id,
        elements: payload.elements,
        appState: payload.appState,
      });
    });

    socket.on("cursor:update", (payload: CursorUpdatePayload) => {
      socket.to(room).emit("cursor:update", {
        senderId: socket.id,
        cursor: payload.cursor,
        color: payload.color,
        username: user.name,
      });
    });

    socket.on("disconnect", (reason) => {
      socket.to(room).emit("user:leave", {
        userId: user.userId,
        senderId: socket.id,
      });
      logger.info(
        { whiteboardId, userId: user.userId, sid: socket.id, reason },
        "left",
      );
    });
  });
}
