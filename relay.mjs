import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";

export const RELAY_PROTOCOL_VERSION = 2;
const wireTypes = new Set(["dh-public", "sm2-public", "algorithm-proposal", "algorithm-accept", "chat", "file"]);

// 图片安全实验室的匿名遥测频道：只承载统计与事件类型，服务端再次裁剪，
// 即使客户端误传明文/密钥/图片也会被丢弃。与房间转发完全独立。
const telemetryTypes = new Set([
  "session.online", "redaction.completed", "watermark.issued", "watermark.traced",
  "stego.embed", "stego.detect", "orchestrator.decision", "integrity.alert",
]);

function sanitizeTelemetry(event) {
  if (!event || typeof event !== "object" || !telemetryTypes.has(event.type)) return null;
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const str = (value, max = 48) => (typeof value === "string" ? value.slice(0, max) : "");
  const clean = { type: event.type };
  switch (event.type) {
    case "session.online": clean.sessionId = str(event.sessionId, 36); break;
    case "redaction.completed": clean.regions = num(event.regions); clean.bytes = num(event.bytes); break;
    case "watermark.issued": clean.watermarkId = str(event.watermarkId); break;
    case "watermark.traced": clean.watermarkId = str(event.watermarkId); clean.verified = Boolean(event.verified); break;
    case "stego.embed": clean.psnr = num(event.psnr); clean.capacityUsed = num(event.capacityUsed); break;
    case "stego.detect": clean.score = num(event.score); break;
    case "orchestrator.decision": clean.strategy = str(event.strategy); break;
    case "integrity.alert": clean.module = str(event.module); break;
  }
  return clean;
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

export function localRelayAddresses(httpServer) {
  const address = httpServer.address();
  if (!address || typeof address === "string") return [];
  const ips = Object.values(networkInterfaces()).flat().filter((item) => item && item.family === "IPv4" && !item.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address));
  return [...new Set(ips.map((item) => `ws://${item.address}:${address.port}/ws`))];
}

export function serveRelayInfo(request, response, httpServer) {
  if (new URL(request.url || "/", "http://localhost").pathname !== "/api/relay/info") return false;
  response.writeHead(request.method === "GET" ? 200 : 405, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(request.method === "GET" ? {
    serverId: attachRelay(httpServer).serverId,
    protocolVersion: RELAY_PROTOCOL_VERSION,
    lanUrls: localRelayAddresses(httpServer),
  } : { error: "Method not allowed" }));
  return true;
}

export function attachRelay(httpServer) {
  if (httpServer.__lumoraRelay) return httpServer.__lumoraRelay;
  // A room belongs to one relay instance, not every server in this Node process.
  const rooms = new Map();
  // 遥测订阅者与房间成员相互独立，一个连接可以只订阅大屏而不加入任何房间。
  const telemetrySubscribers = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  wss.serverId = randomUUID();
  httpServer.__lumoraRelay = wss;

  function announce(room) {
    const members = rooms.get(room);
    if (!members) return;
    const roster = [...members].map((client) => ({ id: client.clientId, role: client.role }));
    members.forEach((client) => send(client, { type: "roster", room, members: roster }));
  }

  function leave(socket) {
    const room = socket.room;
    socket.room = undefined;
    if (!room) return;
    const members = rooms.get(room);
    if (!members) return;
    members.delete(socket);
    if (!members.size) rooms.delete(room);
    else announce(room);
  }

  const upgrade = (request, socket, head) => {
    if (new URL(request.url || "/", "http://localhost").pathname !== "/ws") return;
    wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit("connection", webSocket, request));
  };
  httpServer.on("upgrade", upgrade);
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) { telemetrySubscribers.delete(socket); leave(socket); socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.once("close", () => { clearInterval(heartbeat); httpServer.off("upgrade", upgrade); });

  wss.on("connection", (socket) => {
    socket.clientId = randomUUID();
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    send(socket, { type: "welcome", id: socket.clientId, serverId: wss.serverId, protocolVersion: RELAY_PROTOCOL_VERSION });

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error();
      } catch { send(socket, { type: "error", message: "消息格式无效" }); return; }

      if (message.type === "join") {
        const room = String(message.room || "").trim().toUpperCase();
        const role = message.role;
        const reject = (text) => send(socket, { type: "join-error", message: text });
        if (message.protocolVersion !== RELAY_PROTOCOL_VERSION) { reject("客户端版本不一致，请两端都更新到同一份新版源码包"); return; }
        if (!/^[A-Z0-9-]{1,18}$/.test(room)) { reject("房间码需为 1–18 位英文字母、数字或短横线"); return; }
        if (!["encryptor", "decryptor"].includes(role)) { reject("请选择加密端或解密端"); return; }
        leave(socket);
        const members = rooms.get(room) || new Set();
        if (members.size >= 2) { reject("该房间已有两台设备，请更换房间码或等待对端退出"); return; }
        if ([...members].some((member) => member.role === role)) { reject("房间内已有相同角色，请一端选择加密端，另一端选择解密端"); return; }
        socket.room = room;
        socket.role = role;
        members.add(socket);
        rooms.set(room, members);
        send(socket, { type: "joined", room, role, id: socket.clientId, serverId: wss.serverId });
        announce(room);
        return;
      }
      if (message.type === "leave") { leave(socket); return; }
      if (message.type === "telemetry-subscribe") {
        telemetrySubscribers.add(socket);
        send(socket, { type: "telemetry-ready", serverId: wss.serverId });
        return;
      }
      if (message.type === "telemetry-unsubscribe") { telemetrySubscribers.delete(socket); return; }
      if (message.type === "telemetry") {
        const event = sanitizeTelemetry(message.event);
        if (!event) { send(socket, { type: "error", message: "无效的遥测事件" }); return; }
        const forwarded = { type: "telemetry", event, serverTime: Date.now() };
        telemetrySubscribers.forEach((client) => send(client, forwarded));
        return;
      }
      if (!socket.room) { send(socket, { type: "error", message: "请先加入房间" }); return; }
      if (!wireTypes.has(message.type)) { send(socket, { type: "error", message: "不支持的消息类型" }); return; }
      if (["chat", "file", "algorithm-proposal"].includes(message.type) && socket.role !== "encryptor") {
        send(socket, { type: "error", message: "此操作需要由加密端发起" }); return;
      }
      if (message.type === "algorithm-accept" && socket.role !== "decryptor") {
        send(socket, { type: "error", message: "此操作需要由解密端确认" }); return;
      }
      const members = rooms.get(socket.room);
      if (!members || members.size !== 2) { send(socket, { type: "error", message: "对端尚未连接，请等待另一端加入" }); return; }
      const forwarded = { ...message, senderId: socket.clientId, senderRole: socket.role, serverTime: Date.now() };
      members.forEach((client) => { if (client !== socket) send(client, forwarded); });
      send(socket, { type: "delivered", messageType: message.type, clientTag: message.clientTag });
    });
    socket.on("close", () => { telemetrySubscribers.delete(socket); leave(socket); });
    socket.on("error", () => { telemetrySubscribers.delete(socket); leave(socket); });
  });
  return wss;
}
