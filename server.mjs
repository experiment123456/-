import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import "./config.mjs";
import { attachRelay, serveRelayInfo, localRelayAddresses } from "./relay.mjs";
import { createAuthHandler } from "./auth.mjs";
import { authenticatedUserFromRequest } from "./auth.mjs";
import { createAgentHandler } from "./agent.mjs";

const root = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const serveStatic = (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  if (!existsSync(join(root, "index.html"))) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("请先运行 npm run build");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  const relative = normalize(pathname).replace(/^([/\\])+/, "");
  let target = resolve(root, relative || "index.html");
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!existsSync(target) || statSync(target).isDirectory()) {
    if (extname(pathname) || pathname.startsWith("/assets/")) {
      response.writeHead(404);
      response.end();
      return;
    }
    target = join(root, "index.html");
  }
  const size = statSync(target).size;
  const headers = {
    "Content-Type": mime[extname(target)] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
    "Content-Length": size,
  };
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (request.headers.range && request.method === "GET") {
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    let valid = Boolean(range && (range[1] || range[2]) && size > 0);
    if (valid) {
      if (!range[1]) start = Math.max(0, size - Number(range[2]));
      else {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      }
      valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size;
    }
    if (!valid) {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = end - start + 1;
  }
  response.writeHead(status, headers);
  if (request.method === "HEAD" || size === 0) response.end();
  else createReadStream(target, { start, end }).on("error", () => response.destroy()).pipe(response);
};

const authHandler = createAuthHandler();
const agentHandler = createAgentHandler({ getUser: authenticatedUserFromRequest });
const server = createServer((request, response) => {
  if (serveRelayInfo(request, response, server)) return;
  void agentHandler(request, response, () => authHandler(request, response, () => serveStatic(request, response)));
});

attachRelay(server);
server.listen(port, "0.0.0.0", () => {
  console.log(`Lumora Cipher 已启动：http://localhost:${server.address().port}`);
  console.log("两端各自打开 localhost 页面，并在双机通信中填写同一个中继地址。");
  localRelayAddresses(server).forEach((url) => console.log(`可发给同一局域网队友的中继地址：${url}`));
});
