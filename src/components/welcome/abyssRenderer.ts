import { INK, PHASES, clamp01, easeInOutCubic, segment } from "./palette";

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
  let frozen = false;

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
  let seekT = -1; // >=0 时把时间轴钉在指定秒（QA 逐帧取景用，不影响正常播放）
  const watchPerformance = (dtMs: number, elapsed: number) => {
    if (quality === "lite" || elapsed < 3) return;
    if (dtMs > 33) slowMs += dtMs; else slowMs = Math.max(0, slowMs - dtMs * 0.5);
    if (slowMs > 2000) { quality = "lite"; seed(); }
  };

  const drawFrame = (now: number) => {
    const dtMs = Math.min(now - lastTime, 50);
    const dt = dtMs / 1000;
    lastTime = now;
    const t = seekT >= 0 ? seekT : (now - startedAt) / 1000;
    watchPerformance(dtMs, t);
    const q = QUALITY[quality];

    // 相位强度
    const flow = segment(t, PHASES.awakenEnd, 3.8);                 // descent 冲刺感 0→1
    const rainGain = segment(t, PHASES.awakenEnd, 2.3) * (1 - 0.82 * segment(t, PHASES.guardianEnd, PHASES.unfoldEnd))
      + 0.5 * segment(t, PHASES.decryptEnd, PHASES.decryptEnd + 0.8);
    const fogOut = segment(t, 1.6, 3.4);                            // 雾散进度
    const jellyGrow = easeInOutCubic(segment(t, PHASES.descentEnd, PHASES.guardianEnd - 0.3));
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
    // 生物感要点：不对称脉动（收缩快舒张慢）、扇贝形伞缘、触须相位沿长度滞后（甩鞭感）
    if (jellyGrow > 0.001 && jellyFade > 0.001) {
      const R = height * (0.06 + 0.38 * jellyGrow);
      const rawPulse = Math.sin(t * 3.4);
      const contract = rawPulse >= 0 ? rawPulse ** 0.7 : -((-rawPulse) ** 1.4);
      const jx = cx + Math.sin(t * 0.5) * R * 0.06;
      const jy = cy - jellyLift * height * 0.62 + Math.sin(t * 0.8) * R * 0.05 - contract * R * 0.045;
      context.save();
      context.globalAlpha = jellyFade;
      // 整体慢速侧倾：打破"垂直悬停"的僵硬姿态
      context.translate(jx, jy);
      context.rotate(Math.sin(t * 0.45) * 0.05);
      context.translate(-jx, -jy);
      const bellW = R * (0.86 - 0.05 * contract);
      const bellH = R * (0.68 + 0.08 * contract);
      const marginY = jy + bellH * 0.5;
      const rootY = marginY - bellH * 0.32; // 触须根埋进伞盖内侧，避免根部悬空
      // 外圈生物辉光（收缩瞬间更亮）
      const haloA = 0.26 + 0.1 * Math.max(0, contract);
      const halo = context.createRadialGradient(jx, jy, R * 0.08, jx, jy, R * 1.75);
      halo.addColorStop(0, `rgba(${INK.cyan}, ${haloA})`);
      halo.addColorStop(0.5, `rgba(${INK.violet}, ${haloA * 0.45})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = halo;
      context.fillRect(jx - R * 1.8, jy - R * 1.8, R * 3.6, R * 3.6);
      // 伞盖轮廓：宽顶 + 扇贝形伞缘（贝塞尔手绘，替代几何半椭圆）
      const bellPath = () => {
        const apexX = jx + Math.sin(t * 3.4 + 0.9) * bellW * 0.025; // 顶端随脉动轻晃（果冻感）
        context.beginPath();
        context.moveTo(jx - bellW, marginY);
        context.bezierCurveTo(jx - bellW * 1.05, jy - bellH * 0.32, jx - bellW * 0.58, jy - bellH, apexX, jy - bellH);
        context.bezierCurveTo(jx + bellW * 0.58, jy - bellH, jx + bellW * 1.05, jy - bellH * 0.32, jx + bellW, marginY);
        const scallops = 6;
        const step = (bellW * 2) / scallops;
        for (let i = 0; i < scallops; i += 1) {
          const x1 = jx + bellW - step * (i + 0.5);
          const x2 = jx + bellW - step * (i + 1);
          const depthVar = 0.75 + 0.5 * Math.abs(Math.sin(i * 2.7 + 1.3)); // 扇贝深浅错落
          const ripple = Math.sin(t * 3.4 - i * 0.7) * bellH * 0.055;
          context.quadraticCurveTo(x1, marginY - bellH * (0.2 - 0.05 * contract) * depthVar + ripple, x2, marginY);
        }
      };
      // 口腕：3 条半透明飘带（上宽下细收梢、尖端相位滞后，避免"胶囊管"观感）
      for (let a = -1; a <= 1; a += 1) {
        const rootX = jx + a * bellW * 0.2;
        const armLen = R * (0.58 + 0.14 * (a + 1));
        const swayRoot = Math.sin(t * 1.1 + a * 1.3) * R * 0.08;
        const swayTip = Math.sin(t * 1.1 - 0.9 + a * 1.3) * R * 0.3;
        const midX = rootX + swayRoot + (swayTip - swayRoot) * 0.4;
        const midY = rootY + armLen * 0.45;
        const tipX = rootX + swayTip;
        const tipY = rootY + armLen;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(rootX, rootY);
        context.quadraticCurveTo(midX, midY, (midX + tipX) / 2, (midY + tipY) / 2);
        context.strokeStyle = `rgba(${INK.violet}, 0.13)`;
        context.lineWidth = R * 0.12;
        context.stroke();
        context.beginPath();
        context.moveTo((midX + tipX) / 2, (midY + tipY) / 2);
        context.quadraticCurveTo(tipX, tipY - armLen * 0.12, tipX, tipY);
        context.strokeStyle = `rgba(${INK.violet}, 0.1)`;
        context.lineWidth = R * 0.055;
        context.stroke();
        context.beginPath();
        context.moveTo(rootX, rootY);
        context.quadraticCurveTo(midX, midY, tipX, tipY);
        context.strokeStyle = `rgba(${INK.iceCyan}, 0.18)`;
        context.lineWidth = R * 0.03;
        context.stroke();
      }
      // 触须：11 条三段式 S 曲线，长短错落、各自倾漂 + 摆相沿长度滞后（甩鞭感）
      const tendrils = 11;
      for (let k = 0; k < tendrils; k += 1) {
        const u = k / (tendrils - 1);
        const jitter = Math.abs(Math.sin(k * 12.9898 + 4.1));
        const rootX = jx + (u - 0.5) * bellW * 1.24;
        const len = R * (0.72 + 0.46 * jitter + 0.22 * u);
        const phaseK = k * 5.1; // 非共振相位步进，杜绝相邻触须同摆
        const freqK = 1.15 + (k % 4) * 0.13;
        const leanX = (u - 0.5) * R * 0.5 + Math.sin(k * 7.13 + 1.7) * R * 0.14; // 外倾裙摆 + 随机漂移
        const segs = 3;
        const joints: { x: number; y: number }[] = [];
        for (let s = 0; s <= segs; s += 1) {
          const f = s / segs;
          const sway = Math.sin(t * freqK - f * 1.6 + phaseK) * R * (0.04 + 0.24 * f * f);
          joints.push({ x: rootX + sway + leanX * f * f, y: rootY + len * f });
        }
        context.beginPath();
        context.moveTo(joints[0].x, joints[0].y);
        for (let s = 1; s < segs; s += 1) {
          const mx = (joints[s].x + joints[s + 1].x) / 2;
          const my = (joints[s].y + joints[s + 1].y) / 2;
          context.quadraticCurveTo(joints[s].x, joints[s].y, mx, my);
        }
        context.lineTo(joints[segs].x, joints[segs].y);
        context.lineCap = "round";
        // 三档景深：近粗亮、远细淡，中间一档偏紫
        const tier = k % 3;
        const outerA = [0.26, 0.2, 0.14][tier];
        const innerA = [0.66, 0.5, 0.36][tier];
        context.strokeStyle = `rgba(${INK.cyan}, ${outerA})`;
        context.lineWidth = Math.max(1.4, Math.min(3.8, R * [0.017, 0.013, 0.01][tier]));
        context.stroke();
        context.strokeStyle = tier === 1 ? `rgba(${INK.pinkViolet}, ${innerA})` : `rgba(${INK.iceCyan}, ${innerA})`;
        context.lineWidth = Math.max(0.7, Math.min(1.5, R * [0.007, 0.006, 0.005][tier]));
        context.stroke();
        // 尖端彩色光点
        const tip = joints[segs];
        const tipColor = k % 3 === 0 ? INK.gold : k % 3 === 1 ? INK.pinkViolet : INK.iceCyan;
        context.beginPath();
        context.arc(tip.x, tip.y, Math.max(1.4, Math.min(2.4, R * 0.011)), 0, Math.PI * 2);
        context.fillStyle = `rgba(${tipColor}, 0.88)`;
        context.shadowColor = `rgba(${tipColor}, 0.85)`;
        context.shadowBlur = quality === "lite" ? 0 : 8;
        context.fill();
        context.shadowBlur = 0;
      }
      // 伞盖三层：外膜渐变、伞缘内发光、内核（收缩时核心更亮）
      const glow = 0.85 + 0.15 * Math.max(0, contract);
      const bell = context.createRadialGradient(jx, jy - bellH * 0.34, R * 0.04, jx, jy - bellH * 0.1, bellW * 1.34);
      bell.addColorStop(0, `rgba(${INK.white}, ${0.82 * glow})`);
      bell.addColorStop(0.4, `rgba(${INK.cyan}, ${0.66 * glow})`);
      bell.addColorStop(0.74, `rgba(${INK.violet}, 0.5)`);
      bell.addColorStop(0.9, `rgba(${INK.violet}, 0.28)`);
      bell.addColorStop(1, "rgba(0,0,0,0)");
      bellPath();
      context.fillStyle = bell;
      context.fill();
      // 伞缘内发光：点亮"内伞"，让触须根部从光里长出来
      context.save();
      bellPath();
      context.clip();
      const under = context.createRadialGradient(jx, marginY - bellH * 0.02, 0, jx, marginY - bellH * 0.02, bellW * 0.92);
      under.addColorStop(0, `rgba(${INK.iceCyan}, ${0.28 + 0.12 * Math.max(0, contract)})`);
      under.addColorStop(0.6, `rgba(${INK.violet}, 0.13)`);
      under.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = under;
      context.fillRect(jx - bellW, marginY - bellH * 0.55, bellW * 2, bellH * 0.66);
      context.restore();
      const inner = context.createRadialGradient(jx, jy - bellH * 0.15, 0, jx, jy, bellW * 0.62);
      inner.addColorStop(0, `rgba(${INK.white}, ${0.5 * glow})`);
      inner.addColorStop(0.55, `rgba(${INK.iceCyan}, 0.22)`);
      inner.addColorStop(1, "rgba(0,0,0,0)");
      context.save();
      bellPath();
      context.clip();
      context.fillStyle = inner;
      context.fillRect(jx - bellW * 0.7, jy - bellH * 1.1, bellW * 1.4, bellH * 1.6);
      context.restore();
      // 伞缘高光描边
      bellPath();
      context.strokeStyle = `rgba(${INK.iceCyan}, 0.42)`;
      context.lineWidth = 1.6;
      context.shadowColor = `rgba(${INK.cyan}, 0.8)`;
      context.shadowBlur = quality === "lite" ? 0 : 10;
      context.stroke();
      context.shadowBlur = 0;
      // 放射水管：极淡的紫色辐纹（自伞盖中段发散，不在顶点汇聚）
      context.strokeStyle = `rgba(${INK.violet}, 0.07)`;
      context.lineWidth = 1.2;
      for (let c = -2; c <= 2; c += 1) {
        context.beginPath();
        context.moveTo(jx, jy - bellH * 0.55);
        context.quadraticCurveTo(jx + c * bellW * 0.3, jy - bellH * 0.3, jx + c * bellW * 0.42, marginY - bellH * 0.15);
        context.stroke();
      }
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

  const api = {
    destroy: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      delete (window as unknown as { __lumoraSeek?: unknown }).__lumoraSeek;
    },
    freeze: () => {
      frozen = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      drawFrame(performance.now());
    },
    seek: (t: number) => {
      seekT = t >= 0 ? t : -1; // 负值 = 恢复实时时钟
      drawFrame(performance.now());
    },
  };
  // QA 逐帧取景钩子：脚本可把画面钉在任意时间轴秒数截图
  (window as unknown as { __lumoraSeek?: (t: number) => void }).__lumoraSeek = api.seek;
  return api;
}
