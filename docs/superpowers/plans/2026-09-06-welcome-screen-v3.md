# 欢迎页 v3 改版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复 v1 水母双视频背景并以更深夜蓝滤镜 + 青蓝 wash 做出区分，画布保留气泡与拖尾、移除光柱。

**Architecture:** `WelcomeScreen` 恢复底色/暗幕/wash/水母四层，画布置于视频之上、文字之下；`WelcomeAbyssCanvas` 删除光柱；CSS 恢复视频层样式（滤镜区别于 Ocean）并调整 z-index。

**设计文档:** `docs/superpowers/specs/2026-09-06-welcome-screen-design.md`（v3 章节）

---

### Task 9: WelcomeAbyssCanvas 移除光柱

**Files:**
- Modify: `src/components/WelcomeAbyssCanvas.tsx`

- [ ] **Step 1: 删除光柱**

删除 `drawBeam` 函数及 `drawScene` 中的 4 处 `drawBeam(...)` 调用（`context.globalCompositeOperation = "lighter"` 保留，气泡与拖尾仍需加法混合发光）。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出。

- [ ] **Step 3: 提交**

```bash
git add src/components/WelcomeAbyssCanvas.tsx
git commit -m "refactor: drop light beams from welcome canvas, keep bubbles and trail"
```

---

### Task 10: WelcomeScreen 恢复视频层

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: 在 `<WelcomeAbyssCanvas />` 之前插入四层背景**

```tsx
<div className="welcome-base" aria-hidden="true" />
<video
  className="welcome-media"
  autoPlay
  muted
  loop
  playsInline
  poster="/assets/ocean/dark-curtain-poster.jpg"
  src="/assets/ocean/dark-curtain-loop.mp4"
  aria-hidden="true"
/>
<div className="welcome-wash" aria-hidden="true" />
<video
  className="welcome-jelly"
  autoPlay
  muted
  loop
  playsInline
  src="/assets/ocean/aurex-jellyfish-overlay.mp4"
  aria-hidden="true"
/>
<WelcomeAbyssCanvas />
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出。

- [ ] **Step 3: 提交**

```bash
git add src/components/WelcomeScreen.tsx
git commit -m "feat: restore abyss video layers under welcome canvas"
```

---

### Task 11: CSS 恢复视频层样式并做区分

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 在 `.welcome-screen` 规则后、`.welcome-abyss-canvas` 之前插入**

```css
.welcome-base {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(120% 120% at 50% 0%, #043047 0%, #021428 62%, #010c18 100%);
}
/* v3：与 Ocean 仪表盘区分——更深夜蓝调 + 青蓝罩染 */
.welcome-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.9;
  filter: saturate(1.05) brightness(0.72) contrast(1.12) hue-rotate(-8deg);
}
.welcome-wash {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(8, 60, 92, 0.3), rgba(4, 30, 56, 0.1) 45%, rgba(1, 10, 24, 0.28));
}
.welcome-jelly {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.58;
  mix-blend-mode: screen;
  filter: saturate(0.78) hue-rotate(5deg) brightness(1.04) contrast(1.08);
}
```

- [ ] **Step 2: z-index 调整**

`.welcome-abyss-canvas` 的 `z-index: 1` 改为 `z-index: 3`；`.welcome-content` 的 `z-index: 3` 改为 `z-index: 4`。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add src/index.css
git commit -m "feat: welcome video layers with midnight-blue tint wash"
```

---

### Task 12: 浏览器验证（v3）

**Files:** 临时验证脚本跑完删除

- [ ] **Step 1: 验证检查点**

1. `.welcome-screen` 出现；`<video>` 数量为 2；画布存在且帧数据在变
2. 标题「欢迎进入密码实验室」、6 秒自动进入登录页、控制台无报错
3. 点击 / Enter 提前进入
4. reduced-motion：正常进入
5. `#/workbench` 刷新后回到原页面

- [ ] **Step 2: 删除临时脚本，`git status` 确认除 `data/users.json` 外干净**
