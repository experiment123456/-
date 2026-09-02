import { randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const defaultDataFile = fileURLToPath(new URL("./data/users.json", import.meta.url));
const dataFile = process.env.LUMORA_USER_DATA ? resolve(process.env.LUMORA_USER_DATA) : defaultDataFile;
const cookieName = "lumora_session";
const sessions = new Map();
let writeQueue = Promise.resolve();

const defaultSettings = {
  backgroundAutoplay: true,
  ripplesEnabled: true,
  reducedMotion: false,
};

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf("=");
      if (index < 0) return [part, ""];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求格式无效");
  }
}

async function readStore() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8"));
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if (error?.code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function updateStore(mutator) {
  let result;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await readStore();
    result = await mutator(store);
    await mkdir(dirname(dataFile), { recursive: true });
    await writeFile(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  });
  await writeQueue;
  return result;
}

async function derivePassword(password, salt) {
  return Buffer.from(await scrypt(password, salt, 64));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    settings: { ...defaultSettings, ...user.settings },
  };
}

function validateCredentials(body, isRegister = false) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const displayName = String(body.displayName || username).trim();
  if (!/^[A-Za-z0-9_\u4e00-\u9fff]{3,24}$/u.test(username)) {
    throw new Error("用户名需为 3–24 位中文、字母、数字或下划线");
  }
  if (password.length < 8 || password.length > 128) throw new Error("密码长度需为 8–128 位");
  if (isRegister && (displayName.length < 1 || displayName.length > 24)) throw new Error("昵称长度需为 1–24 位");
  return { username, password, displayName };
}

function sessionFromRequest(request) {
  const token = parseCookies(request.headers.cookie)[cookieName];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function createSession(userId, remember) {
  const token = randomBytes(32).toString("base64url");
  const maxAge = remember ? 7 * 24 * 60 * 60 : 12 * 60 * 60;
  sessions.set(token, { userId, expiresAt: Date.now() + maxAge * 1000 });
  return {
    token,
    cookie: `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  };
}

function clearSession(request) {
  const session = sessionFromRequest(request);
  if (session) sessions.delete(session.token);
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function addActivity(user, label, detail) {
  user.activity = [{ id: randomUUID(), label, detail, at: new Date().toISOString() }, ...(user.activity || [])].slice(0, 24);
}

async function requireUser(request) {
  const session = sessionFromRequest(request);
  if (!session) return null;
  const store = await readStore();
  return store.users.find((candidate) => candidate.id === session.userId) || null;
}

export function createAuthHandler() {
  return async function authHandler(request, response, next) {
    const url = new URL(request.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if (next) next();
      return;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/me") {
        const user = await requireUser(request);
        sendJson(response, 200, { user: user ? publicUser(user) : null });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const body = await parseBody(request);
        const { username, password, displayName } = validateCredentials(body, true);
        const salt = randomBytes(16).toString("hex");
        const passwordHash = (await derivePassword(password, salt)).toString("hex");
        const now = new Date().toISOString();
        const user = await updateStore((store) => {
          if (store.users.some((candidate) => candidate.username.toLocaleLowerCase() === username.toLocaleLowerCase())) {
            throw new Error("该用户名已被使用");
          }
          const created = {
            id: randomUUID(),
            username,
            displayName,
            salt,
            passwordHash,
            createdAt: now,
            lastLoginAt: now,
            settings: { ...defaultSettings },
            activity: [],
          };
          addActivity(created, "账户创建", "已启用安全实验档案与界面偏好同步");
          store.users.push(created);
          return created;
        });
        const session = createSession(user.id, Boolean(body.remember));
        sendJson(response, 201, { user: publicUser(user) }, { "Set-Cookie": session.cookie });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await parseBody(request);
        const { username, password } = validateCredentials(body);
        const store = await readStore();
        const candidate = store.users.find((user) => user.username.toLocaleLowerCase() === username.toLocaleLowerCase());
        if (!candidate) {
          await derivePassword(password, randomBytes(16).toString("hex"));
          sendJson(response, 401, { error: "用户名或密码不正确" });
          return;
        }
        const actual = await derivePassword(password, candidate.salt);
        const expected = Buffer.from(candidate.passwordHash, "hex");
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
          sendJson(response, 401, { error: "用户名或密码不正确" });
          return;
        }
        const user = await updateStore((nextStore) => {
          const current = nextStore.users.find((entry) => entry.id === candidate.id);
          current.lastLoginAt = new Date().toISOString();
          addActivity(current, "账户登录", "新的浏览器会话已建立");
          return current;
        });
        const session = createSession(user.id, Boolean(body.remember));
        sendJson(response, 200, { user: publicUser(user) }, { "Set-Cookie": session.cookie });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSession(request) });
        return;
      }

      const signedIn = await requireUser(request);
      if (!signedIn) {
        sendJson(response, 401, { error: "登录状态已失效，请重新登录" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/account/activity") {
        sendJson(response, 200, { activity: signedIn.activity || [] });
        return;
      }

      if (request.method === "PATCH" && url.pathname === "/api/account/profile") {
        const body = await parseBody(request);
        const displayName = String(body.displayName ?? signedIn.displayName).trim();
        if (displayName.length < 1 || displayName.length > 24) throw new Error("昵称长度需为 1–24 位");
        const user = await updateStore((store) => {
          const current = store.users.find((entry) => entry.id === signedIn.id);
          const incoming = body.settings && typeof body.settings === "object" ? body.settings : {};
          current.displayName = displayName;
          current.settings = {
            backgroundAutoplay: typeof incoming.backgroundAutoplay === "boolean" ? incoming.backgroundAutoplay : current.settings?.backgroundAutoplay ?? true,
            ripplesEnabled: typeof incoming.ripplesEnabled === "boolean" ? incoming.ripplesEnabled : current.settings?.ripplesEnabled ?? true,
            reducedMotion: typeof incoming.reducedMotion === "boolean" ? incoming.reducedMotion : current.settings?.reducedMotion ?? false,
          };
          addActivity(current, "偏好更新", "昵称或沉浸式界面设置已保存");
          return current;
        });
        sendJson(response, 200, { user: publicUser(user) });
        return;
      }

      sendJson(response, 404, { error: "接口不存在" });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "请求处理失败" });
    }
  };
}
