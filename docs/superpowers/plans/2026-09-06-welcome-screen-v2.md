# 欢迎页 v2 改版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 欢迎页改为交互式深海粒子画布背景（光柱 + 气泡 + 鼠标拖尾），新增中文主标题，停留时间 3s→6s。

**Architecture:** 新增独立画布组件 `WelcomeAbyssCanvas`（复用 ParticleVortexCanvas 的 DPR/ResizeObserver/reduced-motion 模式），`WelcomeScreen` 移除视频层接入画布并改标题结构，CSS 删视频相关类、加画布与中文标题样式。

**Tech Stack:** React 19 + Canvas 2D（`lighter` 加法混合）+ 纯 CSS 动画。零新增依赖、零视频。

**设计文档:** `docs/superpowers/specs/2026-09-06-welcome-screen-design.md`（v2 章节）

---

### Task 5: 新增 WelcomeAbyssCanvas 画布组件

**Files:**
- Create: `src/components/WelcomeAbyssCanvas.tsx`

- [ ] **Step 1: 写入组件文件（完整代码）**

```tsx
import { useEffect, useRef } from "react";

type Bubble = {
  x: number; // 0..1，相对宽度
  y: number; // 像素，相对高度
  radius: number;
  speed: number; // 相对高度/秒
  wobble: number;
  wobbleSpeed: number;
};

type TrailPoint = {
  x: number;
  y: number;
  born: number;
};

const TRAIL_LIFE_MS = 900;
const TRAIL_MAX_POINTS = 180;
const BUBBLE_COUNT = 40;
const BUBBLE_REPEL_RADIUS = 90;

export default function WelcomeAbyssCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bubbles: Bubble[] = Array.from({ length: BUBBLE_COUNT }, (_, index) => ({
      x: (index * 0.618) % 1,
      y: Math.random(),
      radius: 1.2 + Math.random() * 3.6,
      speed: 0.028 + Math.random() * 0.075,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.6 + Math.random() * 1.4,
    }));
    let trail: TrailPoint[] = [];
    const pointer = { x: -9999, y: -9999 };

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();

    const resize = () => {
      const bounds = parent.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      pointer.x = x;
      pointer.y = y;
      if (reduceMotion.matches) return;
      const now = performance.now();
      trail.push({ x, y, born: now });
      if (trail.length > TRAIL_MAX_POINTS) trail = trail.slice(-TRAIL_MAX_POINTS);
    };

    // 光柱：自顶部斜射，lighter 混合，角度与强度随 sin 缓慢摆动
    const drawBeam = (time: number, baseX: number, baseAngle: number, phase: number, beamWidth: number) => {
      const angle = baseAngle + Math.sin(time * 0.00025 + phase) * 0.055;
      const strength = 0.1 + Math.sin(time * 0.0004 + phase * 1.7) * 0.045;
      context.save();
      context.translate(width * baseX, -height * 0.08);
      context.rotate(angle);
      const gradient = context.createLinearGradient(0, 0, 0, height * 1.25);
      gradient.addColorStop(0, `rgba(140, 214, 255, ${strength})`);
      gradient.addColorStop(0.55, `rgba(120, 200, 255, ${strength * 0.42})`);
      gradient.addColorStop(1, "rgba(120, 200, 255, 0)");
      context.fillStyle = gradient;
      context.fillRect((-beamWidth * width) / 2, 0, beamWidth * width, height * 1.25);
      context.restore();
    };

    const drawScene = (time: number, dt: number) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

      drawBeam(time, 0.24, 0.2, 0, 0.085);
      drawBeam(time, 0.46, 0.08, 2.1, 0.12);
      drawBeam(time, 0.66, -0.1, 4.2, 0.07);
      drawBeam(time, 0.84, -0.22, 5.6, 0.1);

      // 气泡：上浮 + 左右轻摆 + 鼠标径向推开
      bubbles.forEach((bubble) => {
        if (dt > 0) {
          bubble.y -= bubble.speed * dt;
          bubble.wobble += bubble.wobbleSpeed * dt;
          if (bubble.y < -0.04) {
            bubble.y = 1.04;
            bubble.x = Math.random();
          }
        }
        const bx = (bubble.x + Math.sin(bubble.wobble) * 0.012) * width;
        const by = bubble.y * height;
        const dx = bx - pointer.x;
        const dy = by - pointer.y;
        const distance = Math.hypot(dx, dy);
        let renderX = bx;
        let renderY = by;
        if (distance < BUBBLE_REPEL_RADIUS && distance > 0.001) {
          const push = (1 - distance / BUBBLE_REPEL_RADIUS) * 26;
          renderX += (dx / distance) * push;
          renderY += (dy / distance) * push;
        }
        context.beginPath();
        context.arc(renderX, renderY, bubble.radius, 0, Math.PI * 2);
        context.fillStyle = "rgba(186, 240, 255, 0.16)";
        context.shadowColor = "rgba(160, 228, 255, 0.5)";
        context.shadowBlur = 6;
        context.fill();
        context.shadowBlur = 0;
        context.beginPath();
        context.arc(renderX - bubble.radius * 0.32, renderY - bubble.radius * 0.32, bubble.radius * 0.3, 0, Math.PI * 2);
        context.fillStyle = "rgba(240, 252, 255, 0.3)";
        context.fill();
      });

      // 鼠标拖尾：发光圆点随年龄衰减
      const now = performance.now();
      trail = trail.filter((point) => now - point.born < TRAIL_LIFE_MS);
      trail.forEach((point) => {
        const age = (now - point.born) / TRAIL_LIFE_MS;
        const fade = 1 - age;
        const radius = 1.5 + fade * 7;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${point.born % 3 < 1 ? "196, 250, 255" : "125, 211, 252"}, ${fade * fade * 0.5})`;
        context.shadowColor = `rgba(125, 211, 252, ${fade * 0.9})`;
        context.shadowBlur = 14 * fade + 4;
        context.fill();
        context.shadowBlur = 0;
      });

      context.globalCompositeOperation = "source-over";
    };

    const draw = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      drawScene(time, dt);
      frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    resize();
    if (reduceMotion.matches) drawScene(performance.now(), 0);
    else frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return <canvas className="welcome-abyss-canvas" ref={canvasRef} aria-hidden="true" />;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出（0 个错误）。

- [ ] **Step 3: 提交**

```bash
git add src/components/WelcomeAbyssCanvas.tsx
git commit -m "feat: add interactive abyss canvas for welcome screen"
```

---

### Task 6: WelcomeScreen 接入画布 + 标题改版 + 6s

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: 引入画布、移除视频层**

顶部 import 增加：

```tsx
import WelcomeAbyssCanvas from "./WelcomeAbyssCanvas";
```

JSX 中删除 `<div className="welcome-base" .../>`、两个 `<video .../>`、`<div className="welcome-scrim" .../>`，替换为：

```tsx
<WelcomeAbyssCanvas />
```

- [ ] **Step 2: 文字结构改版**

`welcome-content` 内部改为：

```tsx
<p className="welcome-eyebrow">Lumora · Cipher Laboratory</p>
<h1 className="welcome-title">欢迎进入密码实验室</h1>
<p className="welcome-tagline">在深海噪声之外，<i>守住每一段密钥。</i></p>
<p className="welcome-hint">点击任意位置进入</p>
<span className="welcome-progress" aria-hidden="true" />
```

- [ ] **Step 3: 停留时间 3s→6s**

`window.setTimeout(dismiss, 3000)` 改为 `window.setTimeout(dismiss, 6000)`。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无输出。

- [ ] **Step 5: 提交**

```bash
git add src/components/WelcomeScreen.tsx
git commit -m "feat: welcome screen revamp with canvas background and Chinese title"
```

---

### Task 7: CSS 更新

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 删除视频层样式**

整块删除：`.welcome-base`、`.welcome-media`、`.welcome-scrim`、`.welcome-jelly` 四个类规则。

- [ ] **Step 2: 新增画布样式（放在原 scrim 位置）**

```css
.welcome-abyss-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 3: 标题样式改版**

`.welcome-title` 改为（去掉斜体，中文大标题 + 发光）：

```css
.welcome-title {
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: clamp(2.4rem, 6.4vw, 4.6rem);
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.18;
  text-shadow:
    0 0 26px rgba(56, 189, 248, 0.45),
    0 0 90px rgba(56, 189, 248, 0.22);
  animation: welcome-rise 0.9s ease 0.3s both;
}
```

- [ ] **Step 4: 进度条 3s→6s**

`.welcome-progress` 的 `animation: welcome-progress 3s linear both;` 改为 `animation: welcome-progress 6s linear both;`。

- [ ] **Step 5: 类型检查 + 构建**

Run: `npm run build`
Expected: tsc 通过 + vite build 成功。

- [ ] **Step 6: 提交**

```bash
git add src/index.css
git commit -m "feat: welcome screen canvas styles and Chinese title typography"
```

---

### Task 8: 浏览器验证（v2）

**Files:** 无新增（临时验证脚本跑完删除）

- [ ] **Step 1: 启动开发服务器，写临时 Playwright 脚本验证**

检查点：
1. `.welcome-screen` 出现，页面内 `<video>` 数量为 0，`canvas.welcome-abyss-canvas` 存在
2. 主标题文本为「欢迎进入密码实验室」
3. 画布在动：间隔 500ms 两次读取 canvas 像素数据，哈希不同
4. 6 秒后自动淡出进入登录页（等待 detach 超时上限放宽到 9s）
5. 点击 / Enter 提前进入
6. reduced-motion：无拖尾增长（pointermove 后 trail 点不累积——通过 `document.querySelector('.welcome-abyss-canvas')` 存在且 3s 后仍正常进入验证）
7. `#/workbench` 刷新：欢迎页出现，淡出后回到单机实验台

- [ ] **Step 2: 全部通过后删除临时脚本，确认工作区干净**

Run: `git status`
Expected: 除 `data/users.json` 外无未提交改动。
