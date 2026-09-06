import { useEffect, useRef } from "react";

type Bubble = {
  x: number; // 0..1，相对宽度
  y: number; // 0..1，相对高度
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
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      if (reduceMotion.matches) return;
      trail.push({ x: pointer.x, y: pointer.y, born: performance.now() });
      if (trail.length > TRAIL_MAX_POINTS) trail = trail.slice(-TRAIL_MAX_POINTS);
    };

    const drawScene = (time: number, dt: number) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";

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

      // 鼠标拖尾：发光圆点随年龄衰减，形成彗星尾
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
