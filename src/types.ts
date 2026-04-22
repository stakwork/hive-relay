/**
 * Claims embedded in the JWT issued by Vercel/NextAuth and verified here.
 * `resource` is a capability string like "whiteboard:<id>". The token only
 * grants access to that one resource — server enforces the room from this
 * claim, clients cannot join arbitrary rooms.
 */
export interface AuthedUserClaims {
  userId: string;
  name: string;
  image?: string | null;
  color?: string;
  resource: string;
}

export interface ElementsUpdatePayload {
  elements: unknown[];
  appState: Record<string, unknown>;
}

export interface CursorUpdatePayload {
  cursor: { x: number; y: number };
  color: string;
}

export interface RosterEntry {
  odinguserId: string;
  name: string;
  image: string | null;
  color: string;
  joinedAt: number;
  senderId: string;
}
