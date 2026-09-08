# 欢迎页电影感开场（深渊穿行）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已批准规格 `docs/superpowers/specs/2026-09-08-welcome-cinematic-design.md`，把欢迎页重写为 11 秒一镜到底电影开场（云雾→极光密文雨→水母→拼图画布→解密标题→无缝飞入主页面）。

**Architecture:** GSAP master timeline 驱动 DOM 层（视频淡入、9 格拼贴、文字、闪光），单个 Canvas 2D 渲染器自驱时钟绘制雾/极光雨/水母/漩涡粒子/气泡尘埃/颗粒（粒子逻辑移植自 `ParticleVortexCanvas`）；`App.tsx` 通过 `onReveal` 给 `#app-scene` 加 `is-revealing` 实现"飞入主页面"。

**Tech Stack:** React 19 + TypeScript + GSAP 3.15（已有依赖）+ Canvas 2D + 复用 `DecryptedText`；测试沿用仓库 playwright-core QA 脚本模式。

**关键约定（全计划通用）：**
- 新 CSS 类统一前缀 `wc-`（welcome cinematic）；新增组件放 `src/components/welcome/` 目录。
- 时间轴秒数（与 `palette.ts` 中 `PHASES` 一致）：awaken 0–1.2 / descent 1.2–4.0 / guardian 4.0–6.5 / unfold 6.5–8.5 / decrypt 8.5–10.0 / reveal 10.0–11.0。
- QA 页面每次加载都会播开场（`showWelcome` 初始为 true），无需登录态。
- main.tsx 使用 StrictMode 时 effect 会双跑：所有 effect 的 cleanup 必须完整还原（本计划的代码已按此写）。

---

### Task 1: QA 契约先行（失败测试）

**Files:**
- Create: `scripts/welcome-qa.mjs`
- Modify: `package.json`（scripts 区新增一行）

- [ ] **Step 1: 写 QA 脚本 `scripts/welcome-qa.mjs`**

仿 `scripts/media-qa.mjs` 的骨架（spawn server → 等 base URL → chromium → pageerror 收集 → 末尾统一 assert）。QA 通过三张页面覆盖：A=分帧采样+自动进入，B=点击跳过，C=减动效海报。注意 `pageAt` 里 `route.abort()` 拦截一切非本机请求——云端视频在 QA 环境天然被阻断，等于每次都在验证"视频失败兜底"，无需单独用例。

```js
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { browserLocation, screenshotDirectory } from "./browser-utils.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = screenshotDirectory("lumora-welcome-qa");
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root, env: { ...process.env, PORT: "0", LUMORA_USER_DATA: join(await mkdtemp(join(tmpdir(), "lumora-welcome-qa-")), "users.json") },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let browser;
const results = {}, pageErrors = [];

// 采样开场画布：缩到 240x140 后统计亮度 > 24 的像素占比（"非空非纯黑"判定）
async function litRatio(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".wc-canvas");
    if (!canvas) return -1;
    const small = document.createElement("canvas");
    small.width = 240; small.height = 140;
    const sctx = small.getContext("2d");
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    const { data } = sctx.getImageData(0, 0, small.width, small.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum > 24) lit += 1;
    }
    return lit / (small.width * small.height);
  });
}

try {
  const base = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error(`Server start timeout: ${logs}`)), 12000);
    server.once("error", (e) => { clearTimeout(timer); reject(e); });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exit ${code}: ${logs}`)); });
    server.stderr.on("data", (chunk) => { logs += chunk; });
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const match = logs.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://localhost:${match[1]}/`); }
    });
  });
  browser = await chromium.launch({ ...browserLocation(), headless: true });

  async function pageAt(setup = async () => {}, contextOptions = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...contextOptions });
    // 拦截全部外链（含云端视频）：QA 永远在"视频不可用"的最坏路径下验证兜底
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await setup(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    return page;
  }

  // ---- 页面 A：分帧采样 + 拼贴图就绪 + 自动飞入 ----
  const cine = await pageAt();
  await cine.locator(".wc-root").waitFor(); // 等 React 挂载，避免 isVisible 快照竞态
  results.overlayPresent = true;
  results.overlayZIndex = await cine.locator(".wc-root").evaluate((el) => getComputedStyle(el).zIndex);
  await cine.locator(".wc-canvas").waitFor(); // t0 对齐动画起点，首帧采样不再受冷启动影响
  const samples = [500, 2000, 5000, 7000, 9000, 10500];
  const t0 = Date.now();
  for (const at of samples) {
    await cine.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    const ratio = await litRatio(cine);
    results[`frame_${at}ms`] = Number(ratio.toFixed(4));
    assert.ok(ratio > 0.004, `frame at ${at}ms must show visible content, lit ratio ${ratio}`);
    await cine.screenshot({ path: join(output, `frame-${at}ms.png`) });
  }
  results.collageImages = await cine.evaluate(() =>
    Array.from(document.querySelectorAll(".wc-collage img")).map((img) => img.complete && img.naturalWidth > 0).filter(Boolean).length);
  assert.equal(results.collageImages, 8, "collage must render exactly 8 screenshot tiles");
  await cine.locator(".wc-root").waitFor({ state: "detached", timeout: 4500 }); // 11s 时间轴 + 退出动画
  results.autoEntersApp = true;
  await cine.context().close();

  // ---- 页面 B：点击跳过 ----
  const skip = await pageAt();
  await skip.waitForTimeout(1200);
  await skip.locator(".wc-root").click();
  await skip.locator(".wc-root").waitFor({ state: "detached", timeout: 1500 });
  results.clickSkips = true;
  await skip.context().close();

  // ---- 页面 C：prefers-reduced-motion 海报式 ----
  // 断言对象是 .wc-tile / .wc-core（海报路径 gsap.set 的目标），而非恒为 opacity 1 的 .wc-collage
  const reduced = await pageAt(undefined, { reducedMotion: "reduce" });
  await reduced.waitForTimeout(800);
  results.reducedMotionPoster = await reduced.locator(".wc-tile").first().evaluate((el) => getComputedStyle(el).opacity === "1")
    && await reduced.locator(".wc-core").evaluate((el) => getComputedStyle(el).opacity === "1");
  assert.equal(results.reducedMotionPoster, true, "reduced motion must show the poster collage immediately");
  await reduced.locator(".wc-root").waitFor({ state: "detached", timeout: 5000 });
  results.reducedMotionAutoEnters = true;
  await reduced.context().close();

  console.log(JSON.stringify({ results, pageErrors, artifacts: output }, null, 2));
  assert.equal(results.overlayPresent, true, "welcome cinematic overlay must be present on load");
  assert.equal(results.overlayZIndex, "60", "welcome overlay must sit above the app at z-index 60");
  assert.equal(results.autoEntersApp, true, "timeline must auto-dismiss into the app");
  assert.equal(results.clickSkips, true, "click must skip into the app");
  assert.equal(results.reducedMotionAutoEnters, true, "reduced-motion poster must auto-enter");
  assert.deepEqual(pageErrors, []);
} catch (error) {
  // 失败时也要吐出已收集的结果与截图目录，便于排障
  console.error(JSON.stringify({ results, pageErrors, artifacts: output }));
  throw error;
} finally {
  try { await browser?.close(); } finally { server.kill(); }
}
```

- [ ] **Step 2: 在 `package.json` 的 scripts 里加一行**（放在 `"test:media"` 之后）

```json
"test:welcome": "node scripts/welcome-qa.mjs",
```

- [ ] **Step 3: 运行确认失败（红）**

Run: `npm run test:welcome`
Expected: FAIL —— `.wc-root` 不存在，`locator(".wc-root").isVisible()` 为 false 或超时（后续 Task 2–5 逐步实现，此检查点在 Task 6 转绿）。

- [ ] **Step 4: 提交**

```bash
git add scripts/welcome-qa.mjs package.json
git commit -m "test: add welcome cinematic qa contract (red)"
```

---

### Task 2: 调色板常量 + Canvas 渲染器

**Files:**
- Create: `src/components/welcome/palette.ts`
- Create: `src/components/welcome/abyssRenderer.ts`

- [ ] **Step 1: 写 `src/components/welcome/palette.ts`**

```ts
// 开场时间轴相位（秒）与色彩脚本——与规格 docs/superpowers/specs/2026-09-08-welcome-cinematic-design.md 一致
export const PHASES = {
  awakenEnd: 1.2,
  descentEnd: 4.0,
  guardianEnd: 6.5,
  unfoldEnd: 8.5,
  decryptEnd: 10.0,
  total: 11.0,
} as const;

// 「青 / 紫 / 金」三色相体系；值为 "r, g, b" 便于 rgba() 拼接
export const INK = {
  cyan: "125, 211, 252",
  iceCyan: "165, 243, 252",
  violet: "192, 132, 252",
  pinkViolet: "240, 171, 252",
  gold: "255, 202, 133",
  white: "224, 247, 255",
} as const;

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
/** t 落在 [a,b] 的归一化进度 */
export const segment = (t: number, a: number, b: number) => (b === a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
export const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
/** 加速型缓动：用于镜头推进（expo.in 的可用近似，避免 p=0 处数值过小） */
export const easeInCinematic = (p: number) => p ** 2.4;
```

- [ ] **Step 2: 写 `src/components/welcome/abyssRenderer.ts`（单 canvas、自驱 rAF 时钟）**

```ts
import { INK, PHASES, clamp01, easeInCinematic, easeInOutCubic, segment } from "./palette";

type FogBlob = { nx: number; ny: number; scale: number; dir: -1 | 1; phase: number };
type RainColumn = { x0: number; y0: number; z0: number; speed: number; color: string; glyphs: string[] };
type VortexParticle = { angle: number; radius: number; speed: number; depth: number; phase: number; size: number; color: string; px: number; py: number };
type Bubble = { x: number; y: number; radius: number; speed: number; wobble: number; wobbleSpeed: number };
type Mote = { x: number; y: number; radius: number; drift: number; phase: number; color: string };

export type AbyssHandle = {
  destroy: () => void;
  /** 静态化：停掉 rAF 并补画一帧（reduced-motion 海报用） */
  freeze: () => void;
};

const QUALITY = {
  full: { rain: 26, vortex: 110, bubbles: 40, motes: 34, grain: true, rays: true },
  lite: { rain: 14, vortex: 55, bubbles: 20, motes: 18, grain: false, rays: false },
} as const;

const RAIN_HEX = "0123456789abcdef";
const makeGlyphs = (count: number) =>
  Array.from({ length: count }, () => RAIN_HEX[(Math.random() * 16) | 0] + RAIN_HEX[(Math.random() * 16) | 0]);
// 极光雨按列分配三色：青 50% / 紫 30% / 金 20%
const rainColor = (index: number) => (index % 10 < 5 ? INK.cyan : index % 10 < 8 ? INK.violet : INK.gold);
// 漩涡粒子按 AI 导师同款比例：≈12% 暖金，其余青多于紫
const vortexColor = (index: number) => (index % 8 === 3 ? INK.gold : index % 5 < 2 ? INK.violet : INK.cyan);

export function createAbyssRenderer(canvas: HTMLCanvasElement): AbyssHandle {
  const parent = canvas.parentElement;
  const context = canvas.getContext("2d");
  if (!parent || !context) return { destroy: () => {}, freeze: () => {} };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let quality: keyof typeof QUALITY = "full";
  let frozen = false; // freeze()/reduced-motion 静态帧标记：resize 清空画布后需补画

  // ---- 雾团 sprite（预渲染一次，运行期只 drawImage）----
  const fogSprite = document.createElement("canvas");
  fogSprite.width = 256; fogSprite.height = 256;
  {
    const fogCtx = fogSprite.getContext("2d")!;
    const gradient = fogCtx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, "rgba(196, 226, 244, 0.9)");
    gradient.addColorStop(0.55, "rgba(148, 196, 230, 0.42)");
    gradient.addColorStop(1, "rgba(148, 196, 230, 0)");
    fogCtx.fillStyle = gradient;
    fogCtx.fillRect(0, 0, 256, 256);
  }

  // ---- 胶片颗粒 sprite ×2（逐帧交替）----
  const grainFrames = [0, 1].map(() => {
    const tile = document.createElement("canvas");
    tile.width = 128; tile.height = 128;
    const tileCtx = tile.getContext("2d")!;
    const noise = tileCtx.createImageData(128, 128);
    for (let i = 0; i < noise.data.length; i += 4) {
      const value = (Math.random() * 255) | 0;
      noise.data[i] = value; noise.data[i + 1] = value; noise.data[i + 2] = value; noise.data[i + 3] = 20;
    }
    tileCtx.putImageData(noise, 0, 0);
    return tile;
  });

  let fogBlobs: FogBlob[] = [];
  let rainColumns: RainColumn[] = [];
  let vortex: VortexParticle[] = [];
  let bubbles: Bubble[] = [];
  let motes: Mote[] = [];

  const seed = () => {
    const q = QUALITY[quality];
    fogBlobs = [
      { nx: -0.06, ny: 0.42, scale: 1.5, dir: -1, phase: 0.4 },
      { nx: -0.02, ny: 0.75, scale: 1.25, dir: -1, phase: 1.8 },
      { nx: 1.06, ny: 0.38, scale: 1.5, dir: 1, phase: 0.9 },
      { nx: 1.02, ny: 0.72, scale: 1.3, dir: 1, phase: 2.4 },
      { nx: 0.26, ny: 0.3, scale: 1.05, dir: -1, phase: 3.1 },
      { nx: 0.74, ny: 0.62, scale: 1.1, dir: 1, phase: 3.7 },
    ];
    rainColumns = Array.from({ length: q.rain }, (_, index) => ({
      x0: (index + Math.random() * 0.7) / q.rain,
      y0: Math.random(),
      z0: Math.random(),
      speed: 0.5 + Math.random() * 0.9,
      color: rainColor(index),
      glyphs: makeGlyphs(18),
    }));
    vortex = Array.from({ length: q.vortex }, (_, index) => ({
      angle: Math.random() * Math.PI * 2 + index * 0.09,
      radius: 0.16 + Math.random() ** 0.68 * 0.84,
      speed: 0.16 + Math.random() * 0.34,
      depth: 0.28 + Math.random() * 0.72,
      phase: Math.random() * Math.PI * 2,
      size: 0.55 + Math.random() * 2.0,
      color: vortexColor(index),
      px: 0, py: 0,
    }));
    bubbles = Array.from({ length: q.bubbles }, (_, index) => ({
      x: (index * 0.618) % 1,
      y: Math.random(),
      radius: 1.2 + Math.random() * 3.2,
      speed: 0.028 + Math.random() * 0.07,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.6 + Math.random() * 1.4,
    }));
    motes = Array.from({ length: q.motes }, (_, index) => ({
      x: Math.random(), y: Math.random(),
      radius: 0.6 + Math.random() * 1.4,
      drift: 0.008 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2,
      color: index % 6 === 1 ? INK.gold : index % 3 === 0 ? INK.violet : INK.iceCyan,
    }));
  };

  let width = 1, height = 1, dpr = 1;
  const resize = () => {
    const bounds = parent.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    vortex.forEach((p) => { p.px = 0; p.py = 0; });
    if (frozen) drawFrame(performance.now());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);

  // ---- 指针能量（移植 ParticleVortexCanvas 手感）----
  let pointerX = -9999, pointerY = -9999, energy = 1;
  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointerX = event.clientX - bounds.left;
    pointerY = event.clientY - bounds.top;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // ---- 弱机降载：<30fps 持续 2s 一次性降到 lite ----
  let slowMs = 0, lastTime = performance.now(), startedAt = lastTime, frame = 0;
  const watchPerformance = (dtMs: number, elapsed: number) => {
    if (quality === "lite" || elapsed < 3) return;
    if (dtMs > 33) slowMs += dtMs; else slowMs = Math.max(0, slowMs - dtMs * 0.5);
    if (slowMs > 2000) { quality = "lite"; seed(); }
  };

  const drawFrame = (now: number) => {
    const dtMs = Math.min(now - lastTime, 50);
    const dt = dtMs / 1000;
    lastTime = now;
    const t = (now - startedAt) / 1000;
    watchPerformance(dtMs, t);
    const q = QUALITY[quality];

    // 相位强度
    const flow = segment(t, PHASES.awakenEnd, 3.8);                 // descent 冲刺感 0→1
    const rainGain = segment(t, PHASES.awakenEnd, 2.3) * (1 - 0.82 * segment(t, PHASES.guardianEnd, PHASES.unfoldEnd))
      + 0.5 * segment(t, PHASES.decryptEnd, PHASES.decryptEnd + 0.8);
    const fogOut = segment(t, 1.6, 3.4);                            // 雾散进度
    const jellyGrow = easeInCinematic(segment(t, PHASES.descentEnd, PHASES.guardianEnd));
    const jellyLift = easeInOutCubic(segment(t, PHASES.guardianEnd, PHASES.guardianEnd + 0.9));
    const jellyFade = 1 - segment(t, 7.1, 7.9);
    const rayGain = segment(t, PHASES.awakenEnd, 2.5) * (1 - segment(t, 8, 9));

    // 背景
    const bg = context.createRadialGradient(width * 0.5, height * 0.1, 0, width * 0.5, height * 0.55, height * 1.25);
    bg.addColorStop(0, "#043047");
    bg.addColorStop(0.62, "#021428");
    bg.addColorStop(1, "#010b16");
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // 中央微光（awaken 的"一点微光呼吸"）
    const sparkA = (1 - fogOut) * (0.6 + Math.sin(t * 3.4) * 0.4);
    if (sparkA > 0.01) {
      const spark = context.createRadialGradient(width / 2, height * 0.46, 0, width / 2, height * 0.46, 60);
      spark.addColorStop(0, `rgba(${INK.iceCyan}, ${sparkA * 0.9})`);
      spark.addColorStop(0.25, `rgba(${INK.cyan}, ${sparkA * 0.35})`);
      spark.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = spark;
      context.fillRect(width / 2 - 60, height * 0.46 - 60, 120, 120);
    }

    context.globalCompositeOperation = "lighter";

    // 水下光柱
    if (q.rays && rayGain > 0.01) {
      for (let i = 0; i < 4; i += 1) {
        const rx = width * (0.14 + 0.24 * i) + Math.sin(t * 0.23 + i * 1.7) * 42;
        context.save();
        context.translate(rx, -40);
        context.rotate(0.32);
        const ray = context.createLinearGradient(0, 0, 0, height * 0.9);
        ray.addColorStop(0, `rgba(${INK.cyan}, ${0.10 * rayGain})`);
        ray.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = ray;
        context.fillRect(-26, 0, 52, height * 0.9);
        context.restore();
      }
    }

    // 云雾：awaken 合围 → descent 向两侧滑散
    const fogAlpha = 0.9 * (1 - fogOut) + 0.05;
    fogBlobs.forEach((blob) => {
      const slide = blob.dir * easeInOutCubic(fogOut) * width * 0.55;
      const bx = blob.nx * width + slide + Math.sin(t * 0.24 + blob.phase) * 16;
      const by = blob.ny * height + Math.cos(t * 0.19 + blob.phase) * 10;
      const size = height * blob.scale * (1 + Math.sin(t * 0.4 + blob.phase) * 0.04);
      context.globalAlpha = fogAlpha * (0.75 + Math.sin(t * 0.5 + blob.phase * 2) * 0.25);
      context.drawImage(fogSprite, bx - size / 2, by - size / 2, size, size);
    });
    context.globalAlpha = 1;

    // 极光密文雨：透视隧道 + 三色列 + 拖影
    if (rainGain > 0.01) {
      const flowT = Math.max(0, t - PHASES.awakenEnd);
      context.textAlign = "center";
      rainColumns.forEach((column) => {
        const zz = (column.z0 + flowT * column.speed * 0.14) % 1;
        const size = (3 + zz * 13) * Math.max(0.7, height / 900);
        const px = width * (0.5 + (column.x0 - 0.5) * (0.42 + zz * 1.05));
        const span = size * 1.55 * column.glyphs.length;
        const py = (((column.y0 + flowT * column.speed * 0.9 * (0.2 + zz)) % 1.3) - 0.15) * height;
        const alpha = rainGain * clamp01(zz * 6) * clamp01((1 - zz) * 1.6) * 0.8;
        if (alpha < 0.02) return;
        context.font = `${size.toFixed(1)}px ui-monospace, Consolas, monospace`;
        for (let g = 0; g < column.glyphs.length; g += 1) {
          const gy = py - g * size * 1.55;
          if (gy < -span || gy > height + span) continue;
          const glyphAlpha = alpha * (1 - g / column.glyphs.length);
          context.fillStyle = `rgba(${column.color}, ${glyphAlpha.toFixed(3)})`;
          context.fillText(column.glyphs[g], px, gy);
          if (zz > 0.45) { // 近处拖影
            context.fillStyle = `rgba(${column.color}, ${(glyphAlpha * 0.35).toFixed(3)})`;
            context.fillText(column.glyphs[g], px, gy - size * 1.2);
          }
        }
      });
    }

    // 漩涡粒子（移植 ParticleVortexCanvas：拖尾 + 辉光 + 呼吸 + 指针能量）
    const prox = pointerX < -999 ? 0 : Math.max(0, 1 - Math.hypot(pointerX - width / 2, pointerY - height * 0.46) / (width * 0.6));
    energy += (1 + prox * 0.5 - energy) * 0.06;
    const burst = segment(t, PHASES.guardianEnd, 7.6);
    const vortexAlpha = (0.35 + 0.65 * rainGain) * (1 - burst * 0.9) + 0.16 * segment(t, PHASES.decryptEnd, PHASES.total);
    const radiusMul = (1 + flow * 2.0 + burst * 2.2) * Math.min(width, height) * 0.52;
    const cx = width * 0.5, cy = height * 0.46;
    vortex.forEach((particle) => {
      particle.angle += dt * particle.speed * energy * (0.72 + particle.depth * 0.55);
      const breathing = 0.92 + Math.sin(now * 0.00042 + particle.phase) * 0.08;
      const radius = radiusMul * particle.radius * breathing;
      const twist = particle.angle + particle.radius * 5.8 + Math.sin(particle.phase + now * 0.00018) * 0.18;
      const x = cx + Math.cos(twist) * radius * 1.26 + (pointerX < -999 ? 0 : (pointerX - cx) * particle.depth * 0.03);
      const y = cy + Math.sin(twist) * radius * 0.62 + Math.sin(twist * 2 + particle.phase) * radius * 0.075
        + (pointerY < -999 ? 0 : (pointerY - cy) * particle.depth * 0.02);
      const alpha = vortexAlpha * (0.18 + particle.depth * 0.58) * (0.78 + Math.sin(now * 0.0014 + particle.phase) * 0.22);
      const pr = particle.size * (0.72 + particle.depth * 0.58) * Math.min(energy, 1.8);
      if (particle.px !== 0 && alpha > 0.03) {
        context.beginPath();
        context.moveTo(particle.px, particle.py);
        context.lineTo(x, y);
        context.strokeStyle = `rgba(${particle.color}, ${(alpha * 0.42).toFixed(3)})`;
        context.lineWidth = Math.max(0.45, pr * 0.58);
        context.stroke();
      }
      context.beginPath();
      context.arc(x, y, pr, 0, Math.PI * 2);
      context.fillStyle = `rgba(${particle.color}, ${alpha.toFixed(3)})`;
      context.shadowColor = `rgba(${particle.color}, ${Math.min(0.9, alpha + 0.2).toFixed(3)})`;
      context.shadowBlur = quality === "lite" ? 0 : 5 + particle.depth * 8;
      context.fill();
      context.shadowBlur = 0;
      particle.px = x; particle.py = y;
    });

    // 水母：guardian 推近放大，unfold 上移出画；光幕向两侧拉开
    if (jellyGrow > 0.001 && jellyFade > 0.001) {
      const R = height * (0.055 + 0.40 * jellyGrow);
      const jx = cx + Math.sin(t * 0.5) * R * 0.06;
      const jy = cy - jellyLift * height * 0.62 + Math.sin(t * 0.8) * R * 0.05;
      context.save();
      context.globalAlpha = jellyFade;
      // 外圈生物辉光
      const halo = context.createRadialGradient(jx, jy, R * 0.1, jx, jy, R * 1.7);
      halo.addColorStop(0, `rgba(${INK.cyan}, ${0.28 * jellyFade})`);
      halo.addColorStop(0.5, `rgba(${INK.violet}, ${0.12 * jellyFade})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = halo;
      context.fillRect(jx - R * 1.8, jy - R * 1.8, R * 3.6, R * 3.6);
      // 触须（贝塞尔 S 摆）+ 尖端彩色光点
      const bellBottom = jy + R * 0.34;
      for (let k = 0; k < 7; k += 1) {
        const rootX = jx + (k - 3) * R * 0.2;
        const sway = Math.sin(t * 1.3 + k * 0.9) * R * 0.3;
        const tipX = rootX + sway;
        const tipY = bellBottom + R * (1.1 + 0.14 * Math.sin(t * 0.9 + k * 1.4));
        const midX = (rootX + tipX) / 2 + sway * 0.7;
        const midY = bellBottom + R * 0.55;
        context.beginPath();
        context.moveTo(rootX, bellBottom);
        context.quadraticCurveTo(midX, midY, tipX, tipY);
        context.strokeStyle = `rgba(${INK.iceCyan}, ${0.5 * jellyFade})`;
        context.lineWidth = 2.4;
        context.stroke();
        context.beginPath();
        context.quadraticCurveTo(midX, midY, tipX, tipY);
        context.strokeStyle = `rgba(${INK.cyan}, ${0.85 * jellyFade})`;
        context.lineWidth = 1;
        context.stroke();
        const tipColor = k % 3 === 0 ? INK.gold : k % 3 === 1 ? INK.pinkViolet : INK.iceCyan;
        context.beginPath();
        context.arc(tipX, tipY, 2.2, 0, Math.PI * 2);
        context.fillStyle = `rgba(${tipColor}, ${0.9 * jellyFade})`;
        context.shadowColor = `rgba(${tipColor}, 0.9)`;
        context.shadowBlur = 9;
        context.fill();
        context.shadowBlur = 0;
      }
      // 伞盖：青→紫渐变 + 搏动
      const pulse = 1 + Math.sin(t * 2.2) * 0.06;
      const bellW = R * 0.78, bellH = R * 0.52 * pulse;
      const bell = context.createRadialGradient(jx, jy + bellH * 0.2, R * 0.05, jx, jy, bellW * 1.15);
      bell.addColorStop(0, `rgba(${INK.white}, ${0.95 * jellyFade})`);
      bell.addColorStop(0.42, `rgba(${INK.cyan}, ${0.75 * jellyFade})`);
      bell.addColorStop(0.8, `rgba(${INK.violet}, ${0.5 * jellyFade})`);
      bell.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = bell;
      context.beginPath();
      context.ellipse(jx, jy, bellW, bellH, 0, Math.PI, 0);
      context.closePath();
      context.fill();
      context.restore();
      // 光幕：unfold 时两道柔光带自中央滑向两侧
      const curtainSeg = segment(t, PHASES.guardianEnd, 7.4);
      if (curtainSeg > 0 && curtainSeg < 1) {
        const curtainA = Math.sin(curtainSeg * Math.PI) * 0.5;
        [-1, 1].forEach((dir) => {
          const bandX = cx + dir * curtainSeg * width * 0.55;
          const band = context.createLinearGradient(bandX - R, 0, bandX + R, 0);
          band.addColorStop(0, "rgba(0,0,0,0)");
          band.addColorStop(0.5, `rgba(${INK.iceCyan}, ${curtainA})`);
          band.addColorStop(1, "rgba(0,0,0,0)");
          context.fillStyle = band;
          context.fillRect(bandX - R, 0, R * 2, height);
        });
      }
    }

    // 气泡 + 微光尘埃（近景视差层）
    bubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * (1 + flow * 1.6) * dt * 12;
      bubble.wobble += bubble.wobbleSpeed * dt;
      if (bubble.y < -0.04) { bubble.y = 1.04; bubble.x = Math.random(); }
      const bx = (bubble.x + Math.sin(bubble.wobble) * 0.012) * width;
      const by = bubble.y * height;
      context.beginPath();
      context.arc(bx, by, bubble.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(${INK.iceCyan}, 0.14)`;
      context.fill();
    });
    motes.forEach((mote) => {
      mote.y -= mote.drift * dt * 8;
      mote.x += Math.sin(t * 0.4 + mote.phase) * 0.0004;
      if (mote.y < -0.02) { mote.y = 1.02; mote.x = Math.random(); }
      context.beginPath();
      context.arc(mote.x * width, mote.y * height, mote.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(${mote.color}, ${0.16 + Math.sin(t * 1.4 + mote.phase) * 0.1})`;
      context.fill();
    });

    // 胶片颗粒
    if (q.grain) {
      context.globalCompositeOperation = "source-over";
      context.save();
      context.globalAlpha = 0.03;
      context.translate((Math.random() * 64) | 0, (Math.random() * 64) | 0);
      context.fillStyle = context.createPattern(grainFrames[(now / 32) % 2 | 0], "repeat")!;
      context.fillRect(-64, -64, width + 128, height + 128);
      context.restore();
    }
    context.globalCompositeOperation = "source-over";
  };

  const loop = (now: number) => {
    drawFrame(now);
    frame = requestAnimationFrame(loop);
  };

  seed();
  resize();
  if (reduceMotion.matches) {
    frozen = true;
    drawFrame(performance.now());
  } else {
    frame = requestAnimationFrame(loop);
  }

  return {
    destroy: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    },
    freeze: () => {
      frozen = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      drawFrame(performance.now());
    },
  };
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 无新增错误（两个新文件未被引用时也不报 unused，因为是模块导出）。

- [ ] **Step 4: 提交**

```bash
git add src/components/welcome/palette.ts src/components/welcome/abyssRenderer.ts
git commit -m "feat: add abyss cinematic canvas renderer with palette"
```

---

### Task 3: 拼贴层组件 MosaicCollage

**Files:**
- Create: `src/components/welcome/MosaicCollage.tsx`
- Modify: `src/index.css`（在文件末尾追加 wc- 拼贴样式，Task 4 会统一替换旧 welcome 块）

- [ ] **Step 1: 写 `src/components/welcome/MosaicCollage.tsx`**

8 张本地截图（`public/active-theory/assets/` 已有）+ 中央程序化核心格。`data-side`（-1 左侧飞入 / 1 右侧）、`data-order`（0–3 错峰）供 Task 4 的 GSAP 读取。

```tsx
type Tile = { src: string; row: number; col: number; side: -1 | 1; order: number };

// 8 张项目功能截图，左右各 4 张；中央 (2,2) 是程序化核心格
const TILES: Tile[] = [
  { src: "/active-theory/assets/agent-cards/launch.png", row: 1, col: 1, side: -1, order: 3 },
  { src: "/active-theory/assets/agent-cards/guide.png", row: 1, col: 2, side: -1, order: 1 },
  { src: "/active-theory/assets/agent-cards/capabilities.png", row: 1, col: 3, side: 1, order: 2 },
  { src: "/active-theory/assets/agent-cards/security.png", row: 2, col: 1, side: -1, order: 2 },
  { src: "/active-theory/assets/agent-details/cryptography-lab.png", row: 2, col: 3, side: 1, order: 1 },
  { src: "/active-theory/assets/agent-details/interactive-guide.png", row: 3, col: 1, side: -1, order: 1 },
  { src: "/active-theory/assets/agent-details/security-boundaries.png", row: 3, col: 2, side: 1, order: 3 },
  { src: "/active-theory/assets/agent-details/agent-workspace.png", row: 3, col: 3, side: 1, order: 0 },
];

export default function MosaicCollage() {
  return (
    <div className="wc-collage" aria-hidden="true">
      {TILES.map((tile) => (
        <div
          key={tile.src}
          className="wc-tile"
          data-side={tile.side}
          data-order={tile.order}
          style={{ gridRow: tile.row, gridColumn: tile.col }}
        >
          <img className="wc-tile-img" src={tile.src} alt="" draggable={false} />
        </div>
      ))}
      <div className="wc-core" style={{ gridRow: 2, gridColumn: 2 }}>
        <span className="wc-core-glyph">L</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 `src/index.css` 末尾追加拼贴样式**

```css
/* ============ Welcome cinematic (wc-) collage ============ */
.wc-collage {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  width: min(74vmin, 920px);
  aspect-ratio: 16 / 10.5;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(6px, 1vmin, 12px);
  translate: -50% -50%; /* 独立属性：GSAP 内联 transform 与其叠加，缩放期间 resize 仍居中 */
}
/* .wc-tile 是包装 div（承载 is-flying 彗尾伪元素；img 是替换元素，伪元素不渲染） */
.wc-tile {
  position: relative;
  width: 100%;
  height: 100%;
  opacity: 0;
  will-change: transform, opacity, filter;
}
.wc-tile-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid rgba(165, 243, 252, 0.35);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.25);
}
/* 飞行中的彗尾：来向一侧拖出渐隐光带，青紫金交替（data-side 决定方向） */
.wc-tile.is-flying::after {
  content: "";
  position: absolute;
  top: 8%;
  height: 84%;
  width: 46vw;
  pointer-events: none;
}
.wc-tile.is-flying[data-side="-1"]::after { right: 100%; background: linear-gradient(270deg, rgba(125, 211, 252, 0.4), rgba(192, 132, 252, 0.12) 55%, transparent); }
.wc-tile.is-flying[data-side="1"]::after { left: 100%; background: linear-gradient(90deg, rgba(255, 202, 133, 0.34), rgba(125, 211, 252, 0.12) 55%, transparent); }
.wc-core {
  display: grid;
  place-items: center;
  border-radius: 12px;
  background:
    radial-gradient(120% 120% at 50% 20%, rgba(224, 247, 255, 0.95), rgba(56, 189, 248, 0.55) 45%, rgba(14, 116, 144, 0.65));
  border: 1px solid rgba(224, 247, 255, 0.65);
  box-shadow: 0 0 34px 8px rgba(56, 189, 248, 0.45);
  opacity: 0;
  will-change: transform, opacity, filter;
}
.wc-core-glyph {
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 7vmin, 3.6rem);
  font-weight: 700;
  color: #062338;
  text-shadow: 0 0 14px rgba(255, 202, 133, 0.8);
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS（新组件暂未被引用，无错误）。

- [ ] **Step 4: 提交**

```bash
git add src/components/welcome/MosaicCollage.tsx src/index.css
git commit -m "feat: add welcome mosaic collage layer"
```

---

### Task 4: 重写 WelcomeScreen + GSAP 时间轴 + 新 CSS（删旧实现）

**Files:**
- Modify: `src/components/WelcomeScreen.tsx`（整文件重写）
- Modify: `src/index.css`（删除旧 `/* ============ Welcome screen ============ */` 到文件末尾 `@media (prefers-reduced-motion: reduce)` 整块，即现 6410–6551 行区域；追加新 wc- 样式）
- Delete: `src/components/WelcomeAbyssCanvas.tsx`

- [ ] **Step 1: 确认 WelcomeAbyssCanvas 无其他引用**

Run: `grep -rn "WelcomeAbyssCanvas" src/ --include="*.tsx" --include="*.ts"`
Expected: 仅 `src/components/WelcomeScreen.tsx` 一处 import。若还有别处引用，停下报告。

- [ ] **Step 2: 整文件重写 `src/components/WelcomeScreen.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import DecryptedText from "../views/ocean/DecryptedText";
import MosaicCollage from "./welcome/MosaicCollage";
import { createAbyssRenderer } from "./welcome/abyssRenderer";
import { PHASES } from "./welcome/palette";

const VIDEO_SRC = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4";

type WelcomeScreenProps = {
  onDismiss: () => void;
  /** reveal 幕开始（镜头穿过画布）时调用：App 侧让真实主页面放大变清晰 */
  onReveal?: () => void;
};

export default function WelcomeScreen({ onDismiss, onReveal }: WelcomeScreenProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [titleShown, setTitleShown] = useState(false);
  const [plainTitle, setPlainTitle] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const leavingRef = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  const dismiss = useCallback((fast: boolean) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    timelineRef.current?.kill();
    const flash = flashRef.current;
    const finish = () => setIsLeaving(true);
    if (fast && flash) {
      gsap.timeline({ onComplete: finish })
        .fromTo(flash, { opacity: 0 }, { opacity: 0.9, duration: 0.12, ease: "power2.in" })
        .to(flash, { opacity: 0, duration: 0.28, ease: "power2.out" });
    } else {
      finish();
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = rootRef.current?.querySelector<HTMLCanvasElement>(".wc-canvas");
    if (!root || !canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setFinalPoster = () => {
      gsap.set(root.querySelectorAll(".wc-tile"), { opacity: 1, xPercent: 0, rotateY: 0, filter: "blur(0px)" });
      gsap.set(root.querySelector(".wc-core"), { opacity: 1, scale: 1, filter: "blur(0px)" });
      gsap.set(root.querySelectorAll(".wc-fade"), { opacity: 1, y: 0 });
    };

    // 减动效：直接呈现"画布+标题"海报构图，短暂停留后淡入主页面
    if (reduceMotion.matches) {
      setFinalPoster();
      setTitleShown(true);
      setPlainTitle(true);
      const revealTimer = window.setTimeout(() => onRevealRef.current?.(), 1400);
      const exitTimer = window.setTimeout(() => dismiss(false), 2000);
      return () => { window.clearTimeout(revealTimer); window.clearTimeout(exitTimer); };
    }

    const renderer = createAbyssRenderer(canvas);
    const context = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      timelineRef.current = tl;
      tl.addLabel("awaken", 0)
        .addLabel("descent", PHASES.awakenEnd)
        .addLabel("guardian", PHASES.descentEnd)
        .addLabel("unfold", PHASES.guardianEnd)
        .addLabel("decrypt", PHASES.unfoldEnd)
        .addLabel("reveal", PHASES.decryptEnd);

      // 视频：descent 淡入做深海底层（元素本身 loading 前不可见，失败也永不阻塞）
      tl.fromTo(videoRef.current, { opacity: 0 }, { opacity: 0.35, duration: 1.2 }, "descent")
        .to(videoRef.current, { opacity: 0, duration: 0.8 }, "unfold");

      // 拼贴：unfold 时 8 张截图两侧带透视飞入 + 彗尾，核心格吸附
      root.querySelectorAll<HTMLElement>(".wc-tile").forEach((tile) => {
        const dir = Number(tile.dataset.side);
        const delay = 0.12 * Number(tile.dataset.order);
        tl.fromTo(tile,
          { xPercent: dir * 170, rotateY: dir * -38, opacity: 0, filter: "blur(8px) brightness(1.5)" },
          {
            xPercent: 0, rotateY: 0, opacity: 1, filter: "blur(0px) brightness(1)",
            duration: 0.85, ease: "back.out(1.2)",
            onStart: () => tile.classList.add("is-flying"),
            onComplete: () => tile.classList.remove("is-flying"),
          },
          `unfold+=${delay}`);
      });
      tl.fromTo(".wc-core", { scale: 0.4, opacity: 0, filter: "blur(10px)" },
        { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "back.out(1.4)" }, "unfold+=0.35")
        // 画布整体后退压暗成标题背景
        .to(".wc-collage", { scale: 0.94, opacity: 0.38, filter: "blur(2px)", duration: 1.1 }, "decrypt");

      // 暖金光爆：光幕拉开瞬间 1 帧
      tl.fromTo(flashRef.current, { opacity: 0 }, { opacity: 0.7, duration: 0.12, ease: "power2.in" }, "unfold")
        .to(flashRef.current, { opacity: 0, duration: 0.5 }, "unfold+=0.14");

      // 解密标题 + 文案次第亮起
      tl.call(() => setTitleShown(true), undefined, "decrypt+=0.1")
        .fromTo(".wc-eyebrow", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6 }, "decrypt+=0.35")
        .fromTo(".wc-tagline", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6 }, "decrypt+=0.8")
        .fromTo(".wc-hint", { opacity: 0 }, { opacity: 0.9, duration: 0.6 }, "decrypt+=1.2");

      // 进度条 = 时间轴进度
      tl.fromTo(".wc-progress", { scaleX: 0 }, { scaleX: 1, duration: PHASES.total, ease: "none" }, 0);

      // reveal：镜头穿过画布 → 通知 App 放大真实主页面 → 退出
      tl.fromTo(flashRef.current, { opacity: 0 }, { opacity: 0.9, duration: 0.8, ease: "power2.in" }, "reveal+=0.1")
        .call(() => onRevealRef.current?.(), undefined, "reveal")
        .to(flashRef.current, { opacity: 0, duration: 0.3 }, `reveal+=${PHASES.total - PHASES.decryptEnd - 0.35}`)
        .call(() => dismiss(false), undefined, PHASES.total);
    }, root);

    // 视频看门狗：4s 仍未就绪则永久移除（程序化背景无缝顶替）
    const watchdog = window.setTimeout(() => {
      if (!videoReady) videoRef.current?.remove();
    }, 4000);

    return () => {
      window.clearTimeout(watchdog);
      timelineRef.current?.kill();
      context.revert();
      renderer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLeaving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") dismiss(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLeaving, dismiss]);

  return (
    <div
      ref={rootRef}
      className={`wc-root${isLeaving ? " is-leaving" : ""}`}
      onClick={() => dismiss(true)}
      role="button"
      tabIndex={0}
      aria-label="欢迎页，点击任意位置进入"
      onAnimationEnd={(event) => {
        // animationend 会从子元素冒泡上来，只认根元素自己的退出动画
        if (isLeaving && event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="wc-base" aria-hidden="true" />
      <video
        ref={videoRef}
        className="wc-video"
        autoPlay
        muted
        loop
        playsInline
        src={VIDEO_SRC}
        style={{ visibility: videoReady ? "visible" : "hidden" }}
        onLoadedData={() => setVideoReady(true)}
        aria-hidden="true"
      />
      <canvas className="wc-canvas" aria-hidden="true" />
      <div className="wc-wash" aria-hidden="true" />
      <MosaicCollage />
      <div className="wc-flash" ref={flashRef} aria-hidden="true" />
      <div className="wc-content">
        <p className="wc-eyebrow wc-fade">Lumora · Cipher Laboratory</p>
        <h1 className="wc-title">
          {titleShown && (plainTitle
            ? <span>欢迎进入密码实验室</span>
            : (
              <DecryptedText
                text="欢迎进入密码实验室"
                animateOn="view"
                sequential
                revealDirection="center"
                speed={34}
                characters="01<>-_/\\[]{}=+*^?#"
                encryptedClassName="wc-enc"
              />
            ))}
        </h1>
        <p className="wc-tagline wc-fade">在深海噪声之外，<i>守住每一段密钥。</i></p>
        <p className="wc-hint wc-fade">点击任意位置进入</p>
        <span className="wc-progress" aria-hidden="true" />
      </div>
      <div className="wc-vignette" aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 3: 替换 `src/index.css` 的 welcome 样式块**

删除从 `/* ============ Welcome screen ============ */` 注释起至文件末尾（含旧 `@media (prefers-reduced-motion: reduce)` 块，约 6410–6551 行），原位替换为：

```css
/* ============ Welcome cinematic (wc-) ============ */
.wc-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow: hidden;
  cursor: pointer;
  background: #010b16;
  animation: wc-enter 0.6s ease both;
}
.wc-root.is-leaving {
  animation: wc-exit 0.45s ease both;
  pointer-events: none;
}
@keyframes wc-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes wc-exit {
  from { opacity: 1; }
  to { opacity: 0; }
}

.wc-base {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(120% 120% at 50% 10%, #043047 0%, #021428 62%, #010b16 100%);
}
.wc-video {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(1.05) brightness(0.72) contrast(1.12) hue-rotate(-8deg);
}
.wc-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
}
.wc-wash {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: linear-gradient(180deg, rgba(8, 60, 92, 0.22), rgba(4, 30, 56, 0.06) 45%, rgba(1, 10, 24, 0.3));
  pointer-events: none;
}
.wc-flash {
  position: absolute;
  inset: 0;
  z-index: 6;
  opacity: 0;
  background: radial-gradient(circle at 50% 46%, rgba(224, 250, 255, 0.95), rgba(125, 211, 252, 0.35) 42%, rgba(255, 202, 133, 0.12) 62%, rgba(2, 21, 42, 0) 80%);
  pointer-events: none;
}
.wc-vignette {
  position: absolute;
  inset: 0;
  z-index: 7;
  background: radial-gradient(120% 120% at 50% 50%, transparent 58%, rgba(1, 8, 18, 0.55) 100%);
  pointer-events: none;
}

.wc-content {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 0 24px;
  pointer-events: none;
}
.wc-fade { opacity: 0; }
.wc-eyebrow {
  font-family: system-ui, sans-serif;
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.6);
}
.wc-title {
  min-height: 1.2em;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: clamp(2.4rem, 6.4vw, 4.6rem);
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.18;
  text-shadow:
    0 0 26px rgba(56, 189, 248, 0.45),
    0 0 90px rgba(192, 132, 252, 0.2);
  animation: wc-title-track 1.4s ease-out both;
}
@keyframes wc-title-track {
  from { letter-spacing: 0.3em; }
  to { letter-spacing: 0.08em; }
}
.wc-enc { color: rgba(192, 132, 252, 0.75); }
.wc-tagline {
  font-size: clamp(0.95rem, 2.4vw, 1.2rem);
  color: rgba(255, 255, 255, 0.78);
}
.wc-tagline i { color: rgba(165, 243, 252, 0.9); }
.wc-hint {
  margin-top: 26px;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.9);
  animation: wc-breathe 2.4s ease-in-out 1.8s infinite;
}
.wc-progress {
  position: absolute;
  bottom: 26px;
  left: 50%;
  width: min(220px, 52vw);
  height: 2px;
  margin-left: calc(min(220px, 52vw) / -2);
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(125, 211, 252, 0.9), rgba(192, 132, 252, 0.5), rgba(255, 202, 133, 0.6));
  transform-origin: left center;
  transform: scaleX(0);
}

@media (prefers-reduced-motion: reduce) {
  .wc-root,
  .wc-root.is-leaving {
    animation-duration: 0.3s;
  }
  .wc-title { animation: none; }
  .wc-hint { animation: none; color: rgba(255, 255, 255, 0.6); }
  .wc-progress { display: none; }
}
```

- [ ] **Step 4: 删除 `src/components/WelcomeAbyssCanvas.tsx`**

```bash
git rm src/components/WelcomeAbyssCanvas.tsx
```

- [ ] **Step 5: 类型检查 + 构建**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run build`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add src/components/WelcomeScreen.tsx src/index.css
git commit -m "feat: rewrite welcome screen as one-take cinematic intro"
```

---

### Task 5: App.tsx 集成 onReveal（无缝飞入主页面）

**Files:**
- Modify: `src/App.tsx`（约 57 行状态区、310 行 `#app-scene`、520 行 WelcomeScreen 挂载点）
- Modify: `src/index.css`（末尾追加 app 飞入样式）

- [ ] **Step 1: `src/App.tsx` 三处修改**

57 行附近（`showWelcome` state 旁）新增：

```tsx
const [appRevealing, setAppRevealing] = useState(false);
```

310 行附近，`#app-scene` 的 className 追加 revealing 状态（保持原有类不变）：

```tsx
className={`app-scene relative h-[100svh] w-full overflow-hidden bg-black text-white ${settings.reducedMotion ? "motion-reduced" : ""} ${appRevealing ? "is-revealing" : ""}`}
```

520 行附近，WelcomeScreen 传入 onReveal：

```tsx
{showWelcome && <WelcomeScreen onDismiss={() => setShowWelcome(false)} onReveal={() => setAppRevealing(true)} />}
```

- [ ] **Step 2: `src/index.css` 末尾追加**

```css
/* ============ Welcome reveal：真实主页面迎面放大变清晰 ============ */
.app-scene.is-revealing {
  animation: app-fly-in 1.1s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes app-fly-in {
  from { transform: scale(0.94); filter: blur(14px) brightness(1.2); }
  to { transform: scale(1); filter: blur(0px) brightness(1); }
}
@media (prefers-reduced-motion: reduce) {
  .app-scene.is-revealing { animation: none; }
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/App.tsx src/index.css
git commit -m "feat: seamless app fly-in handoff from welcome intro"
```

---

### Task 6: 全量验证（QA 转绿）+ 手动验收

**Files:** 无新文件（跑测 + 修问题）

- [ ] **Step 1: 跑 QA**

Run: `npm run test:welcome`
Expected: 全部断言通过，输出 JSON 中 `results.overlayPresent / autoEntersApp / clickSkips / reducedMotionPoster / reducedMotionAutoEnters` 均为 true、`pageErrors` 为空数组、`frame_*` 均 > 0.004、`artifacts` 目录里有 6 张分帧截图。

若失败，按断言定位：帧采样过暗 → 检查渲染器相位强度；`collageImages ≠ 8` → 检查 MosaicCollage 路径；reduced-motion 失败 → 检查 `wc-collage` 的 gsap.set 是否生效（注意 `.wc-collage` opacity 初始为 1，需检查海报路径是否真的走到）。

- [ ] **Step 2: 跑既有 QA 与构建确认无回归**

Run: `npm run test:media && npm run build`
Expected: 均通过（media-qa 覆盖登录/音乐链路，确认欢迎页重写没碰到它们）。

- [ ] **Step 3: 手动验收清单**

1. `npm run dev` 打开首页，完整看一遍 11s：雾合围 → 极光雨 → 水母推近 → 拼贴铺开（彗尾/金爆）→ 解密标题 → 飞入主页面
2. 连续刷新 3 次，节奏与观感一致；DevTools Network 设为 No threshold 之外再试 Slow 4G（视频应被兜底，动画不受阻）
3. 播放中按 Esc / 空格 / 回车、点击页面：0.4s 快闪进主页面
4. DevTools Performance 面板 4x CPU 降速重刷：应出现自动降载（颗粒/光柱消失、粒子减半）且不卡成幻灯片
5. 鼠标在开场页移动：漩涡粒子能量变化手感与 Ocean 仪表盘一致
6. 系统设置开启"减少动态效果"后刷新：直接出海报构图，约 2s 进主页面
7. 飞入瞬间主页面从模糊放大变清晰，无白屏/闪烁

- [ ] **Step 4: 修复中发现的问题后，提交验收结论**

```bash
git add -A
git commit -m "chore: welcome cinematic intro verified against qa checklist"
```

---

## 计划自审记录

- **规格覆盖**：§2 六幕分镜 → Task 4 时间轴（label 一一对应）；§3 素材清单 → Task 3 TILES + Task 4 视频；§4 色彩/粒子/质感 → Task 2（INK 三色、漩涡移植、颗粒/光柱/vignette）+ Task 3（彗尾三色）；§5 架构 → Task 2–5 文件划分与 `onReveal` 契约；§6 降级（视频看门狗/reduced-motion/弱机降载/跳过/断网）→ Task 4 Step 2 + Task 2 watchPerformance + QA 外链全阻断；§7 测试 → Task 1/6；§8 不做清单未越界。
- **占位符扫描**：无 TBD/TODO；所有代码步骤均含完整代码。
- **类型一致性**：`PHASES`/`INK`/`segment`/`easeInCinematic` 在 Task 2 定义、Task 4 引用名称一致；`createAbyssRenderer` 返回 `AbyssHandle { destroy, freeze }`，Task 4 只用 `destroy`（freeze 留给潜在海报复用，reduced-motion 海报由 gsap.set 实现，不依赖它）；`data-side`/`data-order`/`is-flying` 在 Task 3 与 Task 4 两侧一致；QA 选择器 `.wc-root/.wc-canvas/.wc-collage` 与组件类名一致。
