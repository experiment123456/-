import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await mkdtemp(join(tmpdir(), "lumora-agent-api-qa-"));
let upstreamBody;
let upstreamAuthorization = "";
const upstream = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  upstreamBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  upstreamAuthorization = String(request.headers.authorization || "");
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "千问代理连接成功" } }] })}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamPort = upstream.address().port;
const app = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: "0",
    LUMORA_USER_DATA: join(output, "users.json"),
    DASHSCOPE_API_KEY: "qa-secret-key",
    DASHSCOPE_BASE_URL: `http://127.0.0.1:${upstreamPort}/compatible-mode/v1`,
    DASHSCOPE_MODEL: "qwen-qa-model",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
try {
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`App start timeout: ${logs}`)), 12_000);
    app.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}`); }
    });
    app.stderr.on("data", (chunk) => { logs += chunk; });
  });
  const register = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "agent_api_qa", displayName: "Agent API QA", password: "agent-api-2026", remember: false }),
  });
  assert.equal(register.status, 201);
  const cookie = register.headers.get("set-cookie").split(";", 1)[0];
  const response = await fetch(`${base}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "你好" }], uiState: { view: "agent" } }),
  });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(upstreamAuthorization, "Bearer qa-secret-key");
  assert.equal(upstreamBody.model, "qwen-qa-model");
  assert.equal(upstreamBody.stream, true);
  assert.equal(Array.isArray(upstreamBody.tools) && upstreamBody.tools.length >= 5, true);
  const guidedTourTopics = upstreamBody.tools.find((tool) => tool.function?.name === "start_guided_tour")?.function?.parameters?.properties?.topic?.enum || [];
  const navigationTargets = upstreamBody.tools.find((tool) => tool.function?.name === "navigate_to")?.function?.parameters?.properties?.target?.enum || [];
  const highlightTargets = upstreamBody.tools.find((tool) => tool.function?.name === "highlight_control")?.function?.parameters?.properties?.target?.enum || [];
  const safeDhControls = upstreamBody.tools.find((tool) => tool.function?.name === "activate_control")?.function?.parameters?.properties?.target?.enum || [];
  const fillTargets = upstreamBody.tools.find((tool) => tool.function?.name === "fill_example_text")?.function?.parameters?.properties?.target?.enum || [];
  assert.equal(["dh", "dh_mitm", "dh_protected"].every((topic) => guidedTourTopics.includes(topic)), true);
  assert.equal(["process", "image_lab", "ocean"].every((topic) => guidedTourTopics.includes(topic)), true);
  assert.equal(["image-lab", "ocean"].every((target) => navigationTargets.includes(target)), true);
  assert.equal(["workbench.process", "image-lab.tabs", "ocean.cards"].every((target) => highlightTargets.includes(target)), true);
  assert.equal(["dh.mode.normal", "dh.mode.mitm", "dh.mode.protected", "dh.demo.next", "dh.demo.auto"].every((target) => safeDhControls.includes(target)), true);
  assert.equal(["dh.message.original", "dh.message.modified"].every((target) => fillTargets.includes(target)), true);
  assert.match(upstreamBody.messages[0].content, /受限网页 Agent/);
  assert.match(upstreamBody.messages[0].content, /阿里云百炼（Model Studio）的 DashScope OpenAI 兼容 API/);
  assert.match(upstreamBody.messages[0].content, /qwen-qa-model/);
  assert.match(upstreamBody.messages[0].content, /不得声称整个导师离线运行、完全不接入外部 API/);
  assert.match(upstreamBody.messages[0].content, /界面按纯文本显示回答/);
  assert.equal(events.some((event) => event.type === "meta" && event.configured), true);
  assert.equal(events.some((event) => event.type === "delta" && event.text === "千问代理连接成功"), true);
  assert.equal(events.at(-1).type, "done");

  const createConversation = await fetch(`${base}/api/agent/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "AES 学习记录" }),
  });
  assert.equal(createConversation.status, 201);
  const conversation = (await createConversation.json()).conversation;
  const savedMessages = [
    { role: "user", content: "AES-GCM 为什么需要 nonce？" },
    { role: "assistant", content: "nonce 必须在同一密钥下保持唯一。" },
  ];
  const saveConversation = await fetch(`${base}/api/agent/conversations/${conversation.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: conversation.title, messages: savedMessages }),
  });
  assert.equal(saveConversation.status, 200);

  const history = await fetch(`${base}/api/agent/conversations`, { headers: { Cookie: cookie } }).then((result) => result.json());
  assert.equal(history.conversations.length, 1);
  assert.equal(history.conversations[0].title, "AES 学习记录");
  assert.equal(history.conversations[0].messageCount, 2);
  const restored = await fetch(`${base}/api/agent/conversations/${conversation.id}`, { headers: { Cookie: cookie } }).then((result) => result.json());
  assert.deepEqual(restored.conversation.messages, savedMessages);

  const secondRegister = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "agent_api_other", displayName: "Other User", password: "agent-api-2026", remember: false }),
  });
  assert.equal(secondRegister.status, 201);
  const secondCookie = secondRegister.headers.get("set-cookie").split(";", 1)[0];
  const secondHistory = await fetch(`${base}/api/agent/conversations`, { headers: { Cookie: secondCookie } }).then((result) => result.json());
  assert.deepEqual(secondHistory.conversations, []);
  const crossAccountRead = await fetch(`${base}/api/agent/conversations/${conversation.id}`, { headers: { Cookie: secondCookie } });
  assert.equal(crossAccountRead.status, 404);

  const deleted = await fetch(`${base}/api/agent/conversations/${conversation.id}`, { method: "DELETE", headers: { Cookie: cookie } });
  assert.equal(deleted.status, 200);
  console.log(JSON.stringify({ ok: true, toolCount: upstreamBody.tools.length, events: events.map((event) => event.type), historyIsolation: true }, null, 2));
} finally {
  app.kill();
  upstream.close();
}
