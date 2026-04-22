import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";

const SECRET = process.env.SWARM_API_KEY ?? "dev-shared-secret";
const URL = process.env.RELAY_URL ?? "http://localhost:3333";

function token(userId: string, name: string, resource: string): string {
  return jwt.sign({ userId, name, resource }, SECRET, {
    algorithm: "HS256",
    expiresIn: 60,
  });
}

function client(label: string, userId: string, resource: string): Socket {
  const s = io(URL, {
    auth: { token: token(userId, label, resource) },
    reconnection: false,
    transports: ["websocket"],
  });
  s.on("connect", () => console.log(`  [${label}] connected sid=${s.id}`));
  s.on("connect_error", (err) => console.log(`  [${label}] connect_error: ${err.message}`));
  s.on("user:join", (e) => console.log(`  [${label}] user:join`, e.user?.name));
  s.on("user:leave", (e) => console.log(`  [${label}] user:leave`, e.userId));
  s.on("room:roster", (e) => console.log(`  [${label}] roster size=${e.collaborators?.length ?? 0}`));
  s.on("elements:update", (e) =>
    console.log(`  [${label}] elements:update from=${e.senderId} n=${e.elements?.length}`),
  );
  s.on("cursor:update", (e) =>
    console.log(`  [${label}] cursor:update from=${e.senderId} at=(${e.cursor?.x},${e.cursor?.y})`),
  );
  return s;
}

async function run() {
  console.log("=== 1. happy path: Alice + Bob in same room ===");
  const alice = client("Alice", "u-alice", "whiteboard:wb-1");
  await wait(300);
  const bob = client("Bob", "u-bob", "whiteboard:wb-1");
  await wait(500);

  console.log("--- Alice emits elements:update (Bob should receive) ---");
  alice.emit("elements:update", {
    elements: [{ id: "x", version: 1, isDeleted: false }],
    appState: { viewBackgroundColor: "#fff" },
  });
  await wait(300);

  console.log("--- Alice emits cursor:update (Bob should receive) ---");
  alice.emit("cursor:update", { cursor: { x: 100, y: 200 }, color: "#FF6B6B" });
  await wait(300);

  console.log("=== 2. isolation: Carol on a different whiteboard ===");
  const carol = client("Carol", "u-carol", "whiteboard:wb-2");
  await wait(500);

  console.log("--- Alice emits again (Carol should NOT receive) ---");
  alice.emit("elements:update", {
    elements: [{ id: "y", version: 1 }],
    appState: {},
  });
  await wait(400);

  console.log("=== 3. auth rejection: bad token ===");
  const bad = io(URL, {
    auth: { token: "garbage" },
    reconnection: false,
    transports: ["websocket"],
  });
  bad.on("connect_error", (err) => console.log(`  [bad] connect_error: ${err.message}`));
  await wait(400);

  console.log("=== cleanup ===");
  alice.disconnect();
  bob.disconnect();
  carol.disconnect();
  bad.disconnect();
  await wait(200);
  process.exit(0);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
