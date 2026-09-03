# Lumora Agent 配置与安全边界

Lumora Agent 位于“AI 创新 → 启动 Agent”。它包含两部分：

- 服务端通过千问 OpenAI 兼容接口进行流式对话与 Function Calling。
- 浏览器只执行 `agent.mjs` 中声明、`AgentExperience.tsx` 中验证的站内白名单工具。

进入 Agent 必须先登录。API Key 只由 Node.js 服务读取，不会进入 React 构建产物、浏览器请求或账户数据。

## 配置千问

先在阿里云百炼获取 API Key，并确认 Key 所属地域及工作空间的兼容模式地址。推荐复制项目根目录的 `.env.example` 为 `.env.local`，再填写：

```dotenv
DASHSCOPE_API_KEY=sk-你的Key
DASHSCOPE_BASE_URL=你的OpenAI兼容模式地址/v1
DASHSCOPE_MODEL=qwen-plus
```

`.env.local` 已被 Git 忽略，`npm.cmd run dev`、`npm.cmd start` 和 `start-local.cmd` 都会自动读取。修改后需要重新启动正在运行的服务。

也可以只在当前 PowerShell 窗口临时设置：

```powershell
$env:DASHSCOPE_API_KEY = "sk-你的Key"
$env:DASHSCOPE_BASE_URL = "你的OpenAI兼容模式地址/v1"
$env:DASHSCOPE_MODEL = "qwen-plus"
npm.cmd run dev
```

生产构建方式：

```powershell
$env:DASHSCOPE_API_KEY = "sk-你的Key"
$env:DASHSCOPE_BASE_URL = "你的OpenAI兼容模式地址/v1"
$env:DASHSCOPE_MODEL = "qwen-plus"
npm.cmd run build
npm.cmd start
```

`DASHSCOPE_BASE_URL` 可省略，此时使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`。如果你的 API Key 来自百炼工作空间或其他地域，建议显式填写控制台给出的地址。

不要把 Key 写入 `src`、`public`、Git、截图或浏览器 Local Storage。也不要使用 `VITE_` 前缀，因为带这个前缀的值可能进入前端构建结果。

## 本地演示模式

不设置 `DASHSCOPE_API_KEY` 也可以启动。Agent 状态会显示“本地演示模式”，支持以下指令：

- “带我看看这个网站怎么使用”
- “带我演示 AES”
- “讲解 DH 密钥交换”
- “如何使用双机通信”
- “查看全部算法”

本地模式用于验证 UI 和工具链，不等同于千问回答质量。

## Agent 可以执行的动作

- 在首页、单机实验、DH、双机通信、算法档案、创新与 Agent 页面之间导航。
- 高亮经过 `data-agent-id` 标记的站内控件。
- 向单机实验台填写最多 500 字的非敏感教学示例。
- 选择 AES、生成教学密钥、执行本地加密和 DH 交换。
- 展示双机通信配置，但不会自动连接中继、上传或发送文件。

Agent 不能执行任意 JavaScript、CSS 选择器、登录/登出、联网、上传、下载、剪贴板写入或数据删除。未知工具和不在枚举中的控件会被浏览器拒绝。

## 验收

```powershell
npm.cmd run build
npm.cmd run test:agent
npm.cmd run test:agent-api
```

`test:agent` 使用本地演示模式和临时账号验证中文 Agent 界面、DH 自动演示、跨页面悬浮会话及移动端布局。`test:agent-api` 启动本地伪千问上游，验证 API Key 只由服务端携带、模型名、流式响应及工具定义格式。两项测试都不会写入真实账号库，也不会调用或产生千问费用。
