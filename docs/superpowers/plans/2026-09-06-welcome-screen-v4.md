# 欢迎页 v4 改版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 欢迎页背景视频替换为用户提供的 CloudFront 单层外链视频，移除水母层，其余不动。

**设计文档:** `docs/superpowers/specs/2026-09-06-welcome-screen-design.md`（v4 章节）

---

### Task 13: 替换背景视频

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: WelcomeScreen 删水母层、换视频源**

删除 `<video className="welcome-jelly" ... />` 整块；`welcome-media` 视频去掉 `poster`，`src` 改为：

```
https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4
```

- [ ] **Step 2: index.css 删除 `.welcome-jelly` 规则**

- [ ] **Step 3: 类型检查 + 构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/WelcomeScreen.tsx src/index.css
git commit -m "feat: swap welcome background to cinematic cloudfront video"
```

---

### Task 14: 浏览器验证（v4）

- [ ] **Step 1: 临时 Playwright 脚本验证**

1. 新视频可播放：`video.welcome-media` 的 `readyState >= 2` 且 `networkState !== 3`
2. `<video>` 数量为 1，无 `welcome-jelly`
3. 画布在动、标题正确、6 秒自动进入、点击进入、无控制台报错

- [ ] **Step 2: 删除临时脚本，`git status` 确认除 `data/users.json` 外干净**
