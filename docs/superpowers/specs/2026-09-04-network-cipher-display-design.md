# 双机通信密文展示 — 设计文档

日期：2026-09-04
状态：已获用户批准（方案 A：气泡内嵌可折叠密文块，原生 `<details>/<summary>` 实现）

## 背景与目标

双机安全通信页（`src/views/NetworkView.tsx`）中，加密端发送的 `chat` 消息线上载荷 `payload` 就是密文，解密端收到 `payload` 后用协商算法解密——但界面上两端气泡都只显示明文，密文全程不可见。

目标：在消息气泡中展示传输密文，体现「明文 → 加密 → 密文上线 → 解密端收到密文 → 用协商算法解密 → 明文」的完整教学流程。

## 范围

**只改以下两个文件，不动其他部分：**

- `src/views/NetworkView.tsx`
- `src/index.css`（新增密文块样式类）

**明确不改：**

- WebSocket 线协议与中继（`relay.mjs`）——密文已在 `payload` 字段中传输，无需新字段。
- `src/crypto/engine.ts` 加解密逻辑。
- 文件通道（AES-GCM 文件传输的卡片与流程）。
- 算法协商、DH 交换、连接流程。

## 数据模型

`ChatItem` 增加可选字段：

```ts
interface ChatItem {
  // …现有字段不变
  cipher?: string; // 线上传输的密文原文
}
```

- 加密端：`sendMessage` 中已有的 `payload`（真正发出的密文）写入聊天记录。
- 解密端：处理 `"chat"` 消息时，把收到的 `String(data.payload)` 原文写入聊天记录。
- 系统消息、文件卡片不设置 `cipher`。

## 界面行为

每条有 `cipher` 的消息气泡内、明文上方渲染一个原生折叠块（`<details>`）：

- 摘要行标签区分收发：加密端显示 `密文`，解密端显示 `收到密文`。
- 摘要行在标签后展示完整密文预览，用 CSS 单行截断（`overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`），不做 JS 截断。
- 展开后为等宽字体、`break-all`、限高（约 8rem）内部滚动的密文全文，右上角提供「复制」按钮（复用现有 `copyText`）。
- 元信息行（算法名 · 时间 · MD5 校验）保持在气泡底部，位置与内容均不变。

## 样式

`index.css` 新增一个类 `.chat-cipher`，覆盖：

- `<summary>`：等宽小字号、低透明度、`cursor: pointer`，`list-style` 去除默认三角（用现有图标或 CSS 自绘）。
- 密文正文：`pre-wrap` + `break-all`、等宽字体、半透明背景条、`max-height` 滚动。
- 兼容 `.is-out`（浅色气泡）与默认（深色气泡）两种配色，保证两种气泡上均可读。

## 错误处理

- `cipher` 为可选字段：折叠块仅在存在时渲染；旧记录、系统消息、文件卡片不受影响。
- 密文展示为纯文本渲染（React 转义），无注入风险。
- 复制失败走现有 `copyText` 的错误提示路径。
- 解密失败仍走现有 `setError` 路径，与本设计无关、不修改。

## 验证

1. `npm run build` 通过。
2. `npm run test:network` 通过（双机中文通信回归，确认通信行为无变化）。
3. 手动核对：加密端发送消息后气泡出现「密文」折叠块；解密端同一消息显示「收到密文」折叠块，展开内容与线上 `payload` 一致；明文与 MD5 校验展示不变。
