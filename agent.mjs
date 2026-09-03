import {
  createAgentConversation,
  deleteAgentConversation,
  getAgentConversation,
  listAgentConversations,
  saveAgentConversation,
} from "./auth.mjs";

const defaultBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const defaultModel = "qwen-plus";
const rateWindows = new Map();

const tools = [
  {
    type: "function",
    function: {
      name: "navigate_to",
      description: "打开 Lumora 的指定功能页面。只在确实需要带用户前往某页面时调用。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", enum: ["home", "workbench", "dh", "network", "catalog", "innovation", "image-lab", "ocean", "agent"] },
          reason: { type: "string", description: "用中文简短说明为什么打开该页面" },
        },
        required: ["target", "reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_guided_tour",
      description: "启动一个安全的站内演示。可自动导航、高亮、填入教学示例并执行本地算法；不会连接外部设备或发送文件。",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["platform", "aes", "process", "dh", "dh_mitm", "dh_protected", "network", "catalog", "image_lab", "ocean"] },
        },
        required: ["topic"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_control",
      description: "在当前界面高亮一个控件，适合边讲解边指出位置。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: [
              "nav.workbench", "nav.dh", "nav.network", "nav.catalog", "nav.innovation",
              "workbench.algorithms", "workbench.input", "workbench.key", "workbench.run", "workbench.output",
              "workbench.process", "workbench.process.build", "workbench.process.previous", "workbench.process.next",
              "workbench.process.play", "workbench.process.reset", "workbench.process.steps", "workbench.process.current",
              "dh.mode.normal", "dh.mode.mitm", "dh.mode.protected", "dh.alice", "dh.eve", "dh.bob",
              "dh.reveal", "dh.regenerate", "dh.exchange", "dh.copy-secret", "dh.flow", "dh.signature",
              "dh.demo", "dh.demo.next", "dh.demo.auto", "dh.message.original", "dh.message.modified", "dh.normal.result", "dh.result",
              "network.relay", "network.room", "network.connect",
              "catalog.grid", "image-lab.root", "image-lab.uploader", "image-lab.tabs", "image-lab.stage",
              "image-lab.tab.redaction", "image-lab.tab.stego", "image-lab.tab.watermark", "image-lab.tab.orchestrator",
              "ocean.root", "ocean.open-lab", "ocean.enter", "ocean.hub", "ocean.previous", "ocean.next", "ocean.cards",
            ],
          },
          label: { type: "string" },
        },
        required: ["target", "label"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "activate_control",
      description: "点击一个经过白名单限制的安全教学控件。不得用于登录、登出、联网、上传、下载或清空用户数据。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: [
              "workbench.algorithm.aes", "workbench.sample", "workbench.generate-key", "workbench.run",
              "workbench.process.build", "workbench.process.previous", "workbench.process.next", "workbench.process.play", "workbench.process.reset",
              "dh.mode.normal", "dh.mode.mitm", "dh.mode.protected", "dh.reveal", "dh.regenerate",
              "dh.exchange", "dh.copy-secret", "dh.demo.next", "dh.demo.auto",
              "image-lab.tab.redaction", "image-lab.tab.stego", "image-lab.tab.watermark", "image-lab.tab.orchestrator",
              "ocean.enter", "ocean.previous", "ocean.next", "ocean.open-lab",
            ],
          },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_example_text",
      description: "向白名单输入区域填写非敏感教学示例，可用于单机实验台或 DH 中间人攻击的两处演示消息；不得填写密码、私钥或真实个人信息。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", enum: ["workbench.input", "dh.message.original", "dh.message.modified"], default: "workbench.input" },
          text: { type: "string", maxLength: 500 },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
];

const systemPrompt = `你是 Lumora Cipher 的中文 AI 密码学导师，也是一个受限网页 Agent。
你的职责：讲解古典密码、AES-256-GCM、SM2、MD5、Diffie-Hellman、中间人攻击、ECDSA 签名防护、WebSocket 双机安全通信、算法过程演示，以及图像脱敏、隐写、水印和安全编排，并指导用户使用 Lumora。
网站页面：home 首页；workbench 单机密码实验与算法过程演示；dh DH 密钥交换；network 双机通信；catalog 算法档案；innovation 创新入口；ocean 图像安全展厅；image-lab 图像安全操作台；agent AI 导师。
你可以调用给定工具操作或高亮页面。需要演示时优先且只调用一次 start_guided_tour；普通 DH 使用 dh，中间人攻击使用 dh_mitm，签名防护使用 dh_protected。它会完成对应主题的整套站内引导。必须等待工具结果，工具返回完成后直接总结，不要再次调用同一个演示或把完整演示拆成重复的导航、高亮步骤。
双机通信的真实端到端连接必须有第二台设备选择相反角色，并使用相同中继地址与房间码。不要承诺在单个浏览器里伪造第二台设备或自动完成真实连接；应完整演示配置入口，并清楚说明用户需要在第二台设备完成的动作。
运行架构必须准确区分：对话推理来自外部千问 API；页面导航、高亮与密码算法演示由浏览器中的白名单工具在本地执行。用户发送给导师的对话内容会经 Lumora 服务端转发给千问 API，因此不得声称整个导师离线运行、完全不接入外部 API，或所有对话数据永不离开设备。
当用户询问“接入了什么 API”“使用什么模型”或类似问题时，必须依据下方的当前运行信息直接回答，不得凭空否认、猜测或改写服务商与模型名称。
绝不索取或复述真实密码、私钥、API Key、身份证明和敏感明文。不要声称 MD5、古典密码适合保护真实敏感数据。
回答默认使用简洁中文；先给结论，再逐步解释。用户只问知识时直接回答，不要滥用工具。
界面按纯文本显示回答：不要输出 Markdown 标题、星号粗体、反引号代码标记或 Markdown 表格。`;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function writeEvent(response, event) {
  response.write(`${JSON.stringify(event)}\n`);
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 160 * 1024) throw new Error("对话内容过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("请求格式无效");
  }
}

function checkRate(userId) {
  const now = Date.now();
  const current = rateWindows.get(userId);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 24;
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) throw new Error("messages 必须是数组");
  return input.slice(-32).map((message) => {
    const role = ["user", "assistant", "tool"].includes(message?.role) ? message.role : null;
    if (!role) throw new Error("消息角色无效");
    const content = String(message.content || "").slice(0, 8_000);
    const clean = { role, content };
    if (role === "tool") {
      clean.tool_call_id = String(message.tool_call_id || "").slice(0, 160);
    }
    if (role === "assistant" && Array.isArray(message.tool_calls)) {
      clean.tool_calls = message.tool_calls.slice(0, 6).map((call) => ({
        id: String(call.id || "").slice(0, 160),
        type: "function",
        function: {
          name: String(call.function?.name || "").slice(0, 80),
          arguments: String(call.function?.arguments || "{}").slice(0, 4_000),
        },
      }));
    }
    return clean;
  });
}

function sanitizeUiState(input) {
  const views = new Set(["home", "workbench", "dh", "network", "catalog", "innovation", "image-lab", "ocean", "agent"]);
  const view = views.has(input?.view) ? input.view : "unknown";
  const viewport = ["mobile", "tablet", "desktop"].includes(input?.viewport) ? input.viewport : "unknown";
  return { view, viewport, focused: String(input?.focused || "").slice(0, 120) };
}

function mockResponse(messages) {
  const latest = messages.at(-1);
  if (latest?.role === "tool") return { text: `演示已经完成。${latest.content}。你可以继续问我这一过程背后的算法原理。` };
  const text = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  if (/签名防护|签名验证|ECDSA|阻止.*中间人/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "dh_protected" } };
  if (/中间人|MITM|公钥替换|劫持/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "dh_mitm" } };
  if (/DH|Diffie|密钥交换/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "dh" } };
  if (/过程演示|演示.*过程|演算过程|逐步.*算法/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "process" } };
  if (/图像安全操作台|图像脱敏|隐写|水印|安全编排/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "image_lab" } };
  if (/海洋面板|海底大屏|图像安全展厅/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "ocean" } };
  if (/AES|单机|加密演示/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "aes" } };
  if (/双机|WebSocket|通信/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "network" } };
  if (/算法档案|算法列表|有哪些算法/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "catalog" } };
  if (/怎么用|使用方法|介绍网站|带我看看/i.test(text)) return { tool: "start_guided_tour", arguments: { topic: "platform" } };
  return { text: "我是 Lumora AI 密码学导师。你可以让我讲解 AES、DH、SM2、MD5、图像脱敏、隐写和数字水印，也可以让我打开算法过程演示或图像安全操作台。当前未配置千问 API Key，因此正在使用本地演示模式。" };
}

async function streamMock(response, messages) {
  const result = mockResponse(messages);
  writeEvent(response, { type: "meta", configured: false, model: "本地演示模式" });
  if (result.tool) {
    const id = `mock_${Date.now()}`;
    writeEvent(response, {
      type: "tool_calls",
      calls: [{ id, type: "function", function: { name: result.tool, arguments: JSON.stringify(result.arguments) } }],
    });
    writeEvent(response, { type: "done" });
    response.end();
    return;
  }
  for (const character of result.text) {
    writeEvent(response, { type: "delta", text: character });
  }
  writeEvent(response, { type: "done" });
  response.end();
}

async function streamQwen(response, messages, uiState) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.DASHSCOPE_BASE_URL || defaultBaseUrl).replace(/\/$/, "");
  const model = process.env.DASHSCOPE_MODEL || defaultModel;
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}
当前运行信息：本次回答由阿里云百炼（Model Studio）的 DashScope OpenAI 兼容 API 调用千问模型“${model}”生成。API Key 仅保存在 Lumora 的 Node.js 服务端，绝不能向用户展示或复述。
当前经过脱敏的界面状态：${JSON.stringify(uiState || {})}`,
        },
        ...messages,
      ],
      tools,
      tool_choice: "auto",
      temperature: 0.35,
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text()).slice(0, 1_000);
    throw new Error(`千问服务请求失败（${upstream.status}）：${detail}`);
  }

  writeEvent(response, { type: "meta", configured: true, model });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const calls = [];
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const chunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta || {};
      if (delta.content) writeEvent(response, { type: "delta", text: delta.content });
      for (const partial of delta.tool_calls || []) {
        const index = Number(partial.index || 0);
        calls[index] ||= { id: "", type: "function", function: { name: "", arguments: "" } };
        if (partial.id) calls[index].id += partial.id;
        if (partial.function?.name) calls[index].function.name += partial.function.name;
        if (partial.function?.arguments) calls[index].function.arguments += partial.function.arguments;
      }
      if (chunk.usage) writeEvent(response, { type: "usage", usage: chunk.usage });
    }
    if (done) break;
  }
  if (calls.length) writeEvent(response, { type: "tool_calls", calls });
  writeEvent(response, { type: "done" });
  response.end();
}

export function createAgentHandler({ getUser }) {
  return async function agentHandler(request, response, next) {
    const url = new URL(request.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/agent/")) {
      next?.();
      return;
    }
    try {
      const user = await getUser(request);
      if (!user) {
        sendJson(response, 401, { error: "请先登录后使用 Lumora AI 导师" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/agent/status") {
        sendJson(response, 200, {
          configured: Boolean(process.env.DASHSCOPE_API_KEY),
          model: process.env.DASHSCOPE_MODEL || defaultModel,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/agent/conversations") {
        sendJson(response, 200, { conversations: await listAgentConversations(user.id) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/agent/conversations") {
        const body = await parseBody(request);
        const conversation = await createAgentConversation(user.id, body.title);
        sendJson(response, 201, { conversation });
        return;
      }

      const conversationMatch = /^\/api\/agent\/conversations\/([0-9a-f-]{36})$/i.exec(url.pathname);
      if (conversationMatch && request.method === "GET") {
        const conversation = await getAgentConversation(user.id, conversationMatch[1]);
        if (!conversation) {
          sendJson(response, 404, { error: "没有找到这段历史对话" });
          return;
        }
        sendJson(response, 200, { conversation });
        return;
      }

      if (conversationMatch && request.method === "PUT") {
        const body = await parseBody(request);
        const messages = sanitizeMessages(body.messages);
        const conversation = await saveAgentConversation(user.id, conversationMatch[1], body.title, messages);
        sendJson(response, 200, { conversation });
        return;
      }

      if (conversationMatch && request.method === "DELETE") {
        const deleted = await deleteAgentConversation(user.id, conversationMatch[1]);
        sendJson(response, deleted ? 200 : 404, deleted ? { ok: true } : { error: "没有找到这段历史对话" });
        return;
      }

      if (request.method !== "POST" || url.pathname !== "/api/agent/chat") {
        sendJson(response, 404, { error: "Agent 接口不存在" });
        return;
      }
      if (!checkRate(user.id)) {
        sendJson(response, 429, { error: "请求过于频繁，请稍后再试" });
        return;
      }
      const body = await parseBody(request);
      const messages = sanitizeMessages(body.messages);
      response.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      });
      if (process.env.DASHSCOPE_API_KEY) await streamQwen(response, messages, sanitizeUiState(body.uiState));
      else await streamMock(response, messages);
    } catch (error) {
      if (!response.headersSent) sendJson(response, 400, { error: error instanceof Error ? error.message : "Agent 请求失败" });
      else {
        writeEvent(response, { type: "error", error: error instanceof Error ? error.message : "Agent 请求失败" });
        response.end();
      }
    }
  };
}
