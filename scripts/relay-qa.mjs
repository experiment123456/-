import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { attachRelay, RELAY_PROTOCOL_VERSION } from "../relay.mjs";
import { normalizeRelayUrl, normalizeRoom, defaultRelayUrl } from "../src/network/connection.ts";

const servers = [], clients = [];
async function server() {
  const http = createServer();
  const relay = attachRelay(http);
  servers.push({ http, relay });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  return `ws://127.0.0.1:${http.address().port}/ws`;
}
async function client(url) {
  const ws = new WebSocket(url);
  clients.push(ws);
  const queue = [];
  ws.on("message", (data) => queue.push(JSON.parse(String(data))));
  await once(ws, "open");
  return {
    ws,
    send: (data) => ws.send(JSON.stringify(data)),
    async next(type, predicate = () => true) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const index = queue.findIndex((item) => item.type === type && predicate(item));
        if (index >= 0) return queue.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`No ${type}: ${JSON.stringify(queue)}`);
    },
  };
}
const join = (room, role, protocolVersion = RELAY_PROTOCOL_VERSION) => ({ type: "join", room, role, protocolVersion });
try {
  assert.equal(normalizeRoom(" qa-test "), "QA-TEST");
  for (const bad of ["", "你好", "a b", "A".repeat(19)]) assert.throws(() => normalizeRoom(bad));
  assert.equal(defaultRelayUrl("http://localhost:5173/#network"), "ws://localhost:5173/ws");
  assert.equal(normalizeRelayUrl("192.168.1.2:5173", "http://localhost:5173"), "ws://192.168.1.2:5173/ws");
  assert.equal(normalizeRelayUrl("https://relay.example/ws", "http://localhost:5173"), "wss://relay.example/ws");
  for (const bad of ["", "ftp://x", "ws://user:pass@x/ws", "ws://x/#hash"]) assert.throws(() => normalizeRelayUrl(bad, "http://localhost"));
  assert.throws(() => normalizeRelayUrl("ws://192.168.1.2/ws", "https://example.test"));
  const [urlA, urlB] = await Promise.all([server(), server()]);
  const [a, b, c, separate] = await Promise.all([client(urlA), client(urlA), client(urlA), client(urlB)]);
  const welcomeA = await a.next("welcome"), welcomeB = await b.next("welcome"), welcomeSeparate = await separate.next("welcome");
  assert.equal(welcomeA.serverId, welcomeB.serverId);
  assert.notEqual(welcomeA.serverId, welcomeSeparate.serverId);
  a.ws.send("{broken"); await a.next("error");
  a.send(join("QA", "encryptor", 1)); await a.next("join-error", (m) => /版本/.test(m.message));
  a.send(join("中文", "encryptor")); await a.next("join-error", (m) => /房间码/.test(m.message));
  a.send(join("QA", "encryptor")); await a.next("joined");
  await a.next("roster", (m) => m.members.length === 1);
  b.send(join("QA", "encryptor")); await b.next("join-error", (m) => /相同角色/.test(m.message));
  b.send(join(" qa ", "decryptor")); await b.next("joined");
  await a.next("roster", (m) => m.members.length === 2);
  c.send(join("QA", "decryptor")); await c.next("join-error", (m) => /两台设备/.test(m.message));
  separate.send(join("QA", "encryptor")); await separate.next("joined");
  assert.equal((await separate.next("roster")).members.length, 1, "different services must have isolated room state");
  b.send({ type: "chat", payload: "wrong-role" }); await b.next("error", (m) => /加密端/.test(m.message));
  a.send({ type: "roster", members: [] }); await a.next("error", (m) => /类型/.test(m.message));
  a.send({ type: "chat", payload: "cipher-only", senderId: "spoofed" });
  assert.equal((await b.next("chat")).senderId, welcomeA.id);
  b.ws.close(); await a.next("roster", (m) => m.members.length === 1);
  a.send({ type: "chat", payload: "gone" }); await a.next("error", (m) => /尚未连接/.test(m.message));
  c.send(join("QA", "decryptor")); await c.next("joined");
  await a.next("roster", (m) => m.members.length === 2);
  console.log(JSON.stringify({ endpointValidation: true, serverIsolation: true, sharedRelay: true, roomAndRoleValidation: true, reconnect: true, protocolVersion: RELAY_PROTOCOL_VERSION }, null, 2));
} finally {
  clients.forEach((ws) => ws.terminate());
  await Promise.all(servers.map(async ({ http, relay }) => {
    relay.clients.forEach((ws) => ws.terminate());
    await new Promise((resolve) => relay.close(resolve));
    await new Promise((resolve) => http.close(resolve));
  }));
}
