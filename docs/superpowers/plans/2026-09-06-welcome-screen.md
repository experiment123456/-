# 海洋欢迎页（Welcome Screen）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开网页先显示海洋风格欢迎页，点击任意位置或 3 秒后淡出进入登录页。

**Architecture:** `WelcomeScreen` 组件作为 `position: fixed` 全屏覆盖层（z-60）挂载在 App.tsx 顶层，不触碰路由。视觉层复用 Ocean Dashboard 已验证的双视频配方（暗幕视频 + screen 混合水母视频 + scrim），样式集中在 index.css 的 `welcome-*` 类。

**Tech Stack:** React 19 + Vite + Tailwind 4（本项目自定义 CSS 类与 Tailwind 混用）、纯 CSS 动画、本地视频素材。

**设计文档:** `docs/superpowers/specs/2026-09-06-welcome-screen-design.md`

**验证方式说明:** 项目无单元测试框架，且规格明确不新增 QA 脚本。每个任务以 `npx tsc --noEmit -p tsconfig.app.json` 作类型门禁，最后统一浏览器手动验证。

**注意事项（已接受的取舍）:** 欢迎页显示期间，底层登录页鲸鱼视频也在静音播放，共 3 段视频同时运行约 3 秒。素材均为本地短视频循环，现代设备可承受；不为规避它而改动登录页逻辑。

---

### Task 1: 创建 WelcomeScreen 组件

**Files:**
- Create: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: 写入组件文件（完整代码）**

创建 `src/components/WelcomeScreen.tsx`，内容如下：

```tsx
import { useCallback, useEffect, useRef, useState } from "react";

export default function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const leavingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setIsLeaving(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  useEffect(() => {
    if (isLeaving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLeaving, dismiss]);

  return (
    <div
      className={`welcome-screen${isLeaving ? " is-leaving" : ""}`}
      onClick={dismiss}
      role="button"
      tabIndex={0}
      aria-label="欢迎页，点击任意位置进入"
      onAnimationEnd={(event) => {
        // animationend 会从子元素冒泡上来，只认根元素自己的退出动画
        if (isLeaving && event.target === event.currentTarget) onDismiss();
      }}
    >
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
      <div className="welcome-scrim" aria-hidden="true" />
      <video
        className="welcome-jelly"
        autoPlay
        muted
        loop
        playsInline
        src="/assets/ocean/aurex-jellyfish-overlay.mp4"
        aria-hidden="true"
      />
      <div className="welcome-content">
        <p className="welcome-eyebrow">Lumora Cipher Laboratory</p>
        <h1 className="welcome-title">Lumora</h1>
        <p className="welcome-tagline">在深海噪声之外，<i>守住每一段密钥。</i></p>
        <p className="welcome-hint">点击任意位置进入</p>
        <span className="welcome-progress" aria-hidden="true" />
      </div>
    </div>
  );
}
```

实现要点：
- `leavingRef` 防止点击 + 超时并发触发两次 dismiss。
- 3 秒定时器在卸载时清理；点击提前进入时组件随后卸载，定时器一并清理。
- 键盘 Enter/Space/Escape 均可退出（规格要求 Enter/Escape，Space 是 `role="button"` 的惯例补充）。
- `onAnimationEnd` 必须过滤 `event.target === event.currentTarget`：子元素的进入动画结束事件会冒泡到根元素。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出（0 个错误）。此时 `WelcomeScreen` 尚无人引用，`tsc --noEmit` 仍会检查它（在 `tsconfig.app.json` include 范围内），无未使用导出报错即为通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/WelcomeScreen.tsx
git commit -m "feat: add ocean welcome screen component"
```

---

### Task 2: 添加 welcome-* 样式

**Files:**
- Modify: `src/index.css`（在文件末尾追加）

- [ ] **Step 1: 在 `src/index.css` 末尾追加完整样式块**

```css
/* ============ Welcome screen ============ */
.welcome-screen {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  cursor: pointer;
  background: #010c18;
  animation: welcome-fade-in 0.7s ease both;
}
.welcome-screen.is-leaving {
  animation: welcome-fade-out 0.6s ease both;
}
@keyframes welcome-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes welcome-fade-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(1.035); }
}

.welcome-base {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(120% 120% at 50% 0%, #043047 0%, #021428 62%, #010c18 100%);
}
.welcome-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.86;
  filter: saturate(1.14) brightness(0.82) contrast(1.08);
}
.welcome-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(1, 8, 20, 0.42), rgba(2, 12, 26, 0.18) 42%, rgba(1, 7, 17, 0.6)),
    radial-gradient(90% 70% at 50% 52%, rgba(39, 125, 192, 0.1), transparent 62%);
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

.welcome-content {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 0 24px;
}
.welcome-eyebrow {
  font-family: system-ui, sans-serif;
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.55);
  animation: welcome-rise 0.9s ease 0.15s both;
}
.welcome-title {
  font-size: clamp(4rem, 14vw, 8.5rem);
  font-style: italic;
  font-weight: 400;
  letter-spacing: -0.035em;
  line-height: 1;
  text-shadow: 0 0 60px rgba(56, 189, 248, 0.35);
  animation: welcome-rise 0.9s ease 0.3s both;
}
.welcome-tagline {
  font-size: clamp(0.95rem, 2.4vw, 1.2rem);
  color: rgba(255, 255, 255, 0.78);
  animation: welcome-rise 0.9s ease 0.45s both;
}
.welcome-tagline i {
  color: rgba(165, 243, 252, 0.9);
}
/* hint 的呼吸动画延迟 1.6s：等 rise（0.6s+0.9s=1.5s）结束后再开始，避免两个动画争抢 opacity 产生跳变 */
.welcome-hint {
  margin-top: 26px;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.9);
  animation: welcome-rise 0.9s ease 0.6s both, welcome-breathe 2.4s ease-in-out 1.6s infinite;
}
.welcome-progress {
  width: min(220px, 52vw);
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.9), rgba(125, 211, 252, 0.35));
  transform-origin: left center;
  /* 3s 无延迟：与组件内 3 秒定时器同步走完 */
  animation: welcome-progress 3s linear both;
}

@keyframes welcome-rise {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes welcome-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes welcome-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-screen,
  .welcome-screen.is-leaving {
    animation-duration: 0.3s;
  }
  .welcome-eyebrow,
  .welcome-title,
  .welcome-tagline,
  .welcome-hint {
    animation: none;
  }
  .welcome-hint {
    color: rgba(255, 255, 255, 0.6);
  }
  .welcome-progress {
    display: none;
  }
}
```

实现要点：
- `.welcome-media` / `.welcome-scrim` / `.welcome-jelly` 的参数复制自 `oc2-hub-media` / `oc2-hub-scrim` / `oc2-hub-jelly-media`（src/index.css:3868-3895），使用独立 `welcome-*` 类名，不与 Ocean Dashboard 共享类，避免互相牵连。
- `prefers-reduced-motion` 下进度条隐藏（规格明确），仅保留 0.3s 快速淡入淡出。

- [ ] **Step 2: 类型检查（CSS 不参与 tsc，此步确认无意外破坏）**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出（0 个错误）。

- [ ] **Step 3: 提交**

```bash
git add src/index.css
git commit -m "feat: add welcome screen ocean styles"
```

---

### Task 3: 在 App.tsx 挂载欢迎页

**Files:**
- Modify: `src/App.tsx`（3 处小改动）

- [ ] **Step 1: 添加 import**

在 `src/App.tsx` 现有 import 之后（第 14 行 `import AgentExperience, ...` 之后）添加：

```tsx
import WelcomeScreen from "./components/WelcomeScreen";
```

- [ ] **Step 2: 添加 state**

在 `const [authChecked, setAuthChecked] = useState(false);`（第 48 行）之后添加：

```tsx
const [showWelcome, setShowWelcome] = useState(true);
```

- [ ] **Step 3: 渲染覆盖层**

在 `<AgentExperience ... />` 自闭合标签（第 477-482 行）之后、移动端菜单 `<div className={\`fixed inset-0 z-50 ... \`}` 之前插入：

```tsx
{showWelcome && <WelcomeScreen onDismiss={() => setShowWelcome(false)} />}
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出（0 个错误）。

- [ ] **Step 5: 生产构建验证**

Run: `npm run build`
Expected: `tsc --noEmit` 通过 + `vite build` 成功产出 dist。

- [ ] **Step 6: 提交**

```bash
git add src/App.tsx
git commit -m "feat: show welcome screen before login on app open"
```

---

### Task 4: 浏览器手动验证

**Files:** 无新增（如发现缺陷，修复后按所属文件提交）

- [ ] **Step 1: 启动开发服务器**

Run: `npm run dev`
Expected: Vite 启动，输出本地地址（默认 http://localhost:5173）。

- [ ] **Step 2: 按规格验证清单逐项检查**

1. 打开首页 → 欢迎页出现：深海暗幕视频播放、水母以 screen 混合若隐若现、文字依次上浮、底部进度条 3 秒走完。
2. 等待 3 秒不动 → 欢迎页整体淡出（约 0.6s）进入登录页（鲸鱼视频背景）。
3. 刷新，在欢迎页上点击任意位置 → 立即淡出进入登录页。
4. 刷新，按 Enter 或 Escape → 立即淡出。
5. 系统设置开启"减少动态效果"后刷新 → 无上浮/呼吸动画、无进度条，仅快速淡入淡出，3 秒后仍自动进入。
6. 地址栏输入 `http://localhost:5173/#/workbench` 刷新 → 欢迎页先出现，淡出后回到单机实验台（不是登录页）。
7. 浏览器控制台无新增报错。

- [ ] **Step 3: 全部通过后确认工作区干净**

Run: `git status`
Expected: 除 `data/users.json`（运行时数据，本就处于修改状态）外无未提交改动。

若验证发现问题：修复 → 重跑对应步骤的类型检查 → 以 `fix: ...` 提交。
