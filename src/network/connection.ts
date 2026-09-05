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

export interface RelayAddress {
  host: string;
  port: string;
  protocol: "ws" | "wss";
  path: string;
}

export function splitRelayAddress(value: string, pageUrl: string): RelayAddress {
  const url = new URL(normalizeRelayUrl(value, pageUrl));
  return {
    host: url.hostname,
    port: url.port || (url.protocol === "wss:" ? "443" : "80"),
    protocol: url.protocol === "wss:" ? "wss" : "ws",
    path: url.pathname + url.search,
  };
}

export function buildRelayAddress(address: RelayAddress, pageUrl: string): string {
  const host = address.host.trim();
  const port = address.port.trim();
  if (!host) throw new Error("请输入中继主机的 IP 或域名；推荐填写加密端电脑的局域网 IP");
  if (!/^(?:[^\s/:?#@\[\]\\]+|\[[0-9a-fA-F:.]+\])$/.test(host)) {
    throw new Error("IP / 域名栏只填写主机地址，例如 192.168.1.10；端口请填在右侧，IPv6 地址需加方括号");
  }
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("端口需为 1–65535 的整数，请填写中继主机实际运行的端口");
  }
  const path = address.path.trim() || "/ws";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("#")) {
    throw new Error("中继路径应以 / 开头，通常填写 /ws，且不能包含 #");
  }
  return normalizeRelayUrl(`${address.protocol}://${host}:${Number(port)}${path}`, pageUrl);
}
