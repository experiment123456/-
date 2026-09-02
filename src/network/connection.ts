export const RELAY_PROTOCOL_VERSION = 2;

export function normalizeRoom(value: string): string {
  const room = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,18}$/.test(room)) throw new Error("房间码需为 1–18 位英文字母、数字或短横线");
  return room;
}

export function normalizeRelayUrl(value: string, pageUrl: string): string {
  const page = new URL(pageUrl);
  const raw = value.trim();
  if (!raw) throw new Error("请输入中继服务器地址");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `${page.protocol === "https:" ? "wss" : "ws"}://${raw}`);
  } catch { throw new Error("中继地址格式不正确，例如 ws://192.168.1.10:5173/ws"); }
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (!["ws:", "wss:"].includes(url.protocol) || url.hash || url.username || url.password) {
    throw new Error("请使用不含用户名、密码或 # 片段的 ws:// 或 wss:// 中继地址");
  }
  if (page.protocol === "https:" && url.protocol === "ws:") throw new Error("HTTPS 页面必须使用 wss:// 中继；局域网 ws:// 调试请各自打开本机 http://localhost 页面");
  if (url.pathname === "/") url.pathname = "/ws";
  return url.href;
}

export function defaultRelayUrl(pageUrl: string): string {
  return normalizeRelayUrl(new URL("/ws", pageUrl).href, pageUrl);
}
