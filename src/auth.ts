import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { logger } from "./logger.js";
import type { AuthedUserClaims } from "./types.js";

type NextFn = (err?: Error) => void;

const SECRET = process.env.SWARM_API_KEY;
if (!SECRET) {
  throw new Error("SWARM_API_KEY not set");
}

declare module "socket.io" {
  interface SocketData {
    user: AuthedUserClaims;
  }
}

export function authMiddleware(socket: Socket, next: NextFn) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) {
    return next(new Error("unauthenticated"));
  }

  try {
    const payload = jwt.verify(token, SECRET!) as Partial<AuthedUserClaims> & {
      sub?: string;
    };
    const userId = payload.userId ?? payload.sub;
    if (!userId || !payload.resource || !payload.name) {
      return next(new Error("invalid token claims"));
    }
    socket.data.user = {
      userId,
      name: payload.name,
      image: payload.image ?? null,
      color: payload.color,
      resource: payload.resource,
    };
    next();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "auth failed");
    next(new Error("unauthenticated"));
  }
}
