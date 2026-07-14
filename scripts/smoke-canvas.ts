import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";

const SECRET = process.env.SWARM_API_KEY ?? "local-dev-swarm-key";
const URL = process.env.RELAY_URL ?? "http://localhost:3333";

const received: Record<string, unknown[]> = {};

function token(userId: string, name: string, resource: string): string {
  return jwt.sign({ userId, name, resource, color: "#4ECDC4" }, SECRET, {
    algorithm: "HS256",
    expiresIn: 60,
  });
}

function client(label: string, userId: string, resource: string): Socket {
  received[label] = [];
  const s = io(URL, {
    auth: { token: token(userId, label, resource) },
    reconnection: false,
    transports: ["websocket"],
  });
  s.on("connect", () => console.log(`  [${label}] connected sid=${s.id}`));
  s.on("connect_error", (e) => console.log(`  [${label}] connect_error: ${e.message}`));
  s.on("room:roster", (e) => console.log(`  [${label}] roster size=${e.collaborators?.length ?? 0}`));
  s.on("user:join", (e) => console.log(`  [${label}] user:join ${e.user?.name}`));
  s.on("cursor:update", (e) => {
    received[label].push({ type: "cursor", ...e });
    console.log(`  [${label}] cursor from=${e.senderId} at=(${e.cursor?.x},${e.cursor?.y}) sel=${e.selectedNodeId}`);
  });
  s.on("yupdate", (e) => {
    received[label].push({ type: "yupdate", n: e.update?.length });
    console.log(`  [${label}] yupdate from=${e.senderId} bytes=${e.update?.byteLength ?? e.update?.length}`);
  });
  return s;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log("=== canvas room smoke ===");
  const alice = client("Alice", "u-alice", "canvas:smoketest");
  await wait(300);
  const bob = client("Bob", "u-bob", "canvas:smoketest");
  await wait(500);

  console.log("--- Alice emits cursor:update + yupdate (Bob should get both) ---");
  alice.emit("cursor:update", { cursor: { x: 12, y: 34 }, color: "#FF6B6B", selectedNodeId: "n1" });
  alice.emit("yupdate", { update: new Uint8Array([1, 2, 3, 4, 5]) });
  await wait(400);

  console.log("--- Carol on a DIFFERENT canvas (should get nothing) ---");
  const carol = client("Carol", "u-carol", "canvas:other");
  await wait(400);
  alice.emit("cursor:update", { cursor: { x: 99, y: 99 }, color: "#FF6B6B" });
  await wait(400);

  // Assertions
  const bobCursor = received["Bob"].some((m: any) => m.type === "cursor" && m.selectedNodeId === "n1");
  const bobYupdate = received["Bob"].some((m: any) => m.type === "yupdate" && m.n === 5);
  const carolIsolated = received["Carol"].length === 0;

  console.log("\n=== results ===");
  console.log("  Bob received cursor+selection:", bobCursor ? "PASS" : "FAIL");
  console.log("  Bob received yupdate (5 bytes):", bobYupdate ? "PASS" : "FAIL");
  console.log("  Carol isolated (other canvas):", carolIsolated ? "PASS" : "FAIL");

  alice.disconnect();
  bob.disconnect();
  carol.disconnect();
  const ok = bobCursor && bobYupdate && carolIsolated;
  console.log(ok ? "\nALL PASS" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

run();
