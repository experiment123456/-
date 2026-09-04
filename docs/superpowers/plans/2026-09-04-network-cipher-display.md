# 双机通信密文展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在双机安全通信页的每条消息气泡中，以内嵌可折叠块展示线上传输的密文（加密端显示发出的密文，解密端显示收到的密文），明文与通信逻辑保持不变。

**Architecture:** 密文已经存在于 WebSocket 载荷 `payload` 中，本计划不触碰协议与加解密逻辑，只把 `payload` 记入 `ChatItem.cipher` 并在气泡里用原生 `<details>/<summary>` 渲染折叠块，样式为 `index.css` 新增的 `.chat-cipher` 系列。组件拆分：`NetworkView.tsx` 内新增纯展示组件 `CipherBlock`，通过 `onCopy` 回调复用现有 `copyText`。

**Tech Stack:** React 19 + TypeScript + Vite（`npm run build` = `tsc --noEmit -p tsconfig.app.json && vite build`）+ 手写 CSS（Tailwind v4 插件共存，但本组件沿用页面既有语义类风格）。

**测试说明（重要）：** 本仓库 views 层没有单测框架；QA 脚本是 Playwright 端到端脚本（`scripts/network-qa.mjs` 等）。按用户约束**不得新增/修改测试脚本文件**，因此每个任务的即时验证是 `npm run build`（tsc 类型检查 + 构建），最终验证跑现有 `npm run test:network` 和手动双标签页核对（规格中的验证章节）。

**规格：** `docs/superpowers/specs/2026-09-04-network-cipher-display-design.md`

**提交纪律：** 每个任务单独提交，**只 add 指定的两个源文件**（工作区里 `data/users.json` 有用户的本地改动，绝不能带入提交；不要用 `git add -A` / `git add .`）。

---

### Task 1: 数据层 — `ChatItem.cipher` 字段与两处写入

**Files:**
- Modify: `src/views/NetworkView.tsx`（三处：`ChatItem` 接口约 38-45 行；解密端 append 约 287 行；加密端 append 约 361 行）

- [ ] **Step 1.1: 给 `ChatItem` 增加 `cipher` 可选字段**

将（约 38-45 行）：

```ts
interface ChatItem {
  id: string;
  direction: "out" | "in" | "system";
  text: string;
  algorithm?: string;
  verified?: boolean;
  time: string;
}
```

改为：

```ts
interface ChatItem {
  id: string;
  direction: "out" | "in" | "system";
  text: string;
  algorithm?: string;
  verified?: boolean;
  cipher?: string;
  time: string;
}
```

- [ ] **Step 1.2: 解密端 append 记录收到的密文原文**

在 `socket.onmessage` 的 `"chat"` 分支中（约 287 行），将：

```ts
append({ direction: "in", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: md5(plain) === data.digest });
```

改为：

```ts
append({ direction: "in", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: md5(plain) === data.digest, cipher: String(data.payload) });
```

- [ ] **Step 1.3: 加密端 append 记录发出的密文**

在 `sendMessage` 中（约 361 行），将：

```ts
append({ direction: "out", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: true });
```

改为：

```ts
append({ direction: "out", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: true, cipher: payload });
```

说明：`payload` 就是 `sendWire({ type: "chat", algorithm, payload, ... })` 上线的密文，SM2 分支与对称算法分支都汇到这里，无需区别处理。

- [ ] **Step 1.4: 类型检查 + 构建验证**

Run: `npm run build`
Expected: 退出码 0，末尾出现 `✓ built in …`；无 TS 报错。此时 `cipher` 尚未渲染，界面无可见变化（这是预期）。

- [ ] **Step 1.5: Commit**

```bash
git add src/views/NetworkView.tsx
git commit -m "feat: record wire ciphertext in network chat items"
```

---

### Task 2: 渲染层 — `CipherBlock` 组件与气泡集成

**Files:**
- Modify: `src/views/NetworkView.tsx`（两处：`cipherKeys` 助手函数之后新增组件，约 73 行；消息气泡渲染，约 486-491 行）

- [ ] **Step 2.1: 新增 `CipherBlock` 纯展示组件**

在 `cipherKeys` 函数定义结束（约 73 行 `}` 之后）、`export default function NetworkView()` 之前插入：

```tsx
function CipherBlock({ cipher, outbound, onCopy }: { cipher: string; outbound: boolean; onCopy: (text: string) => void }) {
  return (
    <details className="chat-cipher">
      <summary>
        <span className="chat-cipher-label">{outbound ? "密文" : "收到密文"}</span>
        <span className="chat-cipher-preview">{cipher}</span>
      </summary>
      <div className="chat-cipher-body">
        <button className="chat-cipher-copy" type="button" onClick={() => onCopy(cipher)} title="复制密文">复制</button>
        {cipher}
      </div>
    </details>
  );
}
```

要点：`<summary>` 内含收/发标签 + CSS 单行截断预览；正文是等宽滚动块 + 右上角复制按钮；纯文本渲染由 React 转义，无注入面。

- [ ] **Step 2.2: 气泡内集成（明文上方）**

将（约 486-491 行）：

```tsx
<div className={`chat-row ${item.direction === "out" ? "is-out" : "is-in"}`} key={item.id}>
  <div className="chat-bubble">
    <p className="whitespace-pre-wrap break-words">{item.text}</p>
    <div><span>{item.algorithm}</span><span>{item.time}</span>{item.verified !== undefined && <span className={item.verified ? "text-emerald-200" : "text-amber-200"}>{item.verified ? "MD5 ✓" : "MD5 !"}</span>}</div>
  </div>
</div>
```

改为：

```tsx
<div className={`chat-row ${item.direction === "out" ? "is-out" : "is-in"}`} key={item.id}>
  <div className="chat-bubble">
    {item.cipher && <CipherBlock cipher={item.cipher} outbound={item.direction === "out"} onCopy={(text) => void copyText(text)} />}
    <p className="whitespace-pre-wrap break-words">{item.text}</p>
    <div><span>{item.algorithm}</span><span>{item.time}</span>{item.verified !== undefined && <span className={item.verified ? "text-emerald-200" : "text-amber-200"}>{item.verified ? "MD5 ✓" : "MD5 !"}</span>}</div>
  </div>
</div>
```

要点：`{item.cipher && …}` 保证无 `cipher` 的旧记录/系统消息不渲染折叠块；`onCopy` 复用组件内现有 `copyText`（其失败分支已有 `setError` 提示）。

- [ ] **Step 2.3: 类型检查 + 构建验证**

Run: `npm run build`
Expected: 退出码 0，末尾 `✓ built in …`（此刻样式类尚未定义，折叠块可见但样式未生效，属预期）。

- [ ] **Step 2.4: Commit**

```bash
git add src/views/NetworkView.tsx
git commit -m "feat: render collapsible cipher block in network bubbles"
```

---

### Task 3: 样式层 — `.chat-cipher` 系列 CSS

**Files:**
- Modify: `src/index.css`（在 `.chat-bubble > div { … }` 规则结束（约 894 行）之后、`.file-card {` 之前插入）

- [ ] **Step 3.1: 插入样式**

在 `.chat-bubble > div` 规则的结束 `}` 与 `.file-card {` 之间插入：

```css
.chat-cipher {
  margin-bottom: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.chat-cipher summary {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  cursor: pointer;
  list-style: none;
  font-size: 10px;
  letter-spacing: 0.05em;
  opacity: 0.72;
}

.chat-cipher summary::-webkit-details-marker {
  display: none;
}

.chat-cipher summary::before {
  content: "▸";
  flex: none;
  transition: transform 160ms ease;
}

.chat-cipher[open] summary::before {
  transform: rotate(90deg);
}

.chat-cipher-label {
  flex: none;
}

.chat-cipher-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-cipher-body {
  position: relative;
  margin-top: 7px;
  max-height: 8rem;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.28);
  font-size: 10px;
  line-height: 1.7;
  color: rgba(233, 255, 245, 0.78);
  word-break: break-all;
  white-space: pre-wrap;
}

.chat-cipher-copy {
  position: sticky;
  top: 0;
  float: right;
  margin-left: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 9px;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.is-out .chat-cipher-body {
  border-color: rgba(26, 40, 35, 0.14);
  background: rgba(26, 40, 35, 0.06);
  color: rgba(26, 40, 35, 0.72);
}
```

要点：深色气泡（收）与 `.is-out` 浅色气泡（发）各有一套可读配色；预览用纯 CSS 单行省略；`prefers-reduced-motion` 下仅有的 `transform` 过渡为亚秒级装饰，不影响可读性（与 5edd1b3 的指针反馈修复不冲突，未移除任何 pointer 反馈）。

- [ ] **Step 3.2: 构建验证**

Run: `npm run build`
Expected: 退出码 0，末尾 `✓ built in …`。

- [ ] **Step 3.3: Commit**

```bash
git add src/index.css
git commit -m "style: add chat-cipher styles for ciphertext blocks"
```

---

### Task 4: 端到端验证

**Files:** 无代码改动（验证任务）

- [ ] **Step 4.1: 回归双机通信**

Run: `npm run test:network`
Expected: 退出码 0，末尾输出一段 JSON 结果（含 `relayEndpoint`、`independentServices`、`pageErrors` 等，`pageErrors` 为空数组）。脚本会自行起两个独立服务并开浏览器，结束后自动清理。

- [ ] **Step 4.2: 手动双标签页核对（规格验证章节第 3 条）**

1. Run: `npm run dev`，打开 `http://localhost:5173`，进入「双机通信」。
2. 两个标签页（或两台电脑）：同一中继地址（本机测试用 `ws://localhost:5173/ws`）、相反角色、相同房间码，连接并完成 DH 与算法协商。
3. 加密端发送一条消息（建议含中文，如 `你好，密文可见性测试 🔐`），核对：
   - 加密端气泡出现「密文」折叠块，展开为等宽密文全文，可滚动、可「复制」；
   - 解密端同一时刻的气泡出现「收到密文」折叠块，展开内容与加密端一致；
   - 两端明文、算法名、时间、MD5 校验展示与改动前一致。
4. 切换算法（至少试一个古典算法如 Multiliteral 与 AES、SM2）重复发送，确认各算法密文都正常展示且能解密。
5. 核对系统消息、文件卡片无折叠块（回归无损）。

- [ ] **Step 4.3: 收尾**

如 Step 4.1/4.2 发现问题，修复后仅提交涉及的两个文件并重跑验证；无问题则无需额外提交。

---

## Self-Review 记录

- **规格覆盖**：数据模型/加密端/解密端 → Task 1；界面行为/错误处理（可选字段守卫、复制复用 `copyText`）→ Task 2；样式（`.chat-cipher`、双配色、CSS 截断预览）→ Task 3；验证三项 → Task 4。无遗漏。
- **占位符扫描**：所有代码步骤均为完整代码，无 TBD/TODO。
- **类型一致性**：`cipher?: string`（Task 1 定义）与 `{item.cipher && <CipherBlock cipher={item.cipher} …>}`（Task 2 使用）经 `&&` 守卫后收窄为 `string`，无需断言；`CipherBlock` 的 props（`cipher/outbound/onCopy`）在定义与调用处一致。
