import { useEffect, useRef } from "react";

type ParticleVortexCanvasProps = {
  variant?: "compact" | "hub";
  className?: string;
};

type VortexParticle = {
  angle: number;
  radius: number;
  speed: number;
  depth: number;
  phase: number;
  size: number;
  warm: boolean;
  previousX: number;
  previousY: number;
};

const createRandom = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

export default function ParticleVortexCanvas({ variant = "compact", className = "" }: ParticleVortexCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const random = createRandom(variant === "hub" ? 202603 : 202604);
    const count = variant === "hub" ? 138 : 82;
    const particles: VortexParticle[] = Array.from({ length: count }, (_, index) => ({
      angle: random() * Math.PI * 2 + index * 0.09,
      radius: 0.16 + Math.pow(random(), 0.68) * 0.84,
      speed: 0.16 + random() * 0.34,
      depth: 0.28 + random() * 0.72,
      phase: random() * Math.PI * 2,
      size: 0.55 + random() * (variant === "hub" ? 2.15 : 1.55),
      warm: random() > 0.88,
      previousX: 0,
      previousY: 0,
    }));

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();
    let energy = 1;
    let pointerX = 0;
    let pointerY = 0;

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.forEach((particle) => { particle.previousX = 0; particle.previousY = 0; });
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
      const isNear = x > -0.16 && x < 1.16 && y > -0.16 && y < 1.16;
      pointerX = isNear ? (x - 0.5) * 2 : 0;
      pointerY = isNear ? (y - 0.5) * 2 : 0;
    };

    const draw = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      context.clearRect(0, 0, width, height);
      const proximity = Math.max(0, 1 - Math.hypot(pointerX, pointerY) * 0.58);
      const targetEnergy = 1 + proximity * 0.38;
      energy += (targetEnergy - energy) * 0.06;
      const centerX = width * (variant === "hub" ? 0.52 : 0.58) + pointerX * 6;
      const centerY = height * 0.5 + pointerY * 4;
      const maxRadius = Math.min(width * 0.48, height * (variant === "hub" ? 0.72 : 0.64));
      const xScale = variant === "hub" ? 1.26 : 1.08;
      const yScale = variant === "hub" ? 0.62 : 0.54;

      particles.forEach((particle, index) => {
        if (!reduceMotion.matches) particle.angle += dt * particle.speed * energy * (0.72 + particle.depth * 0.55);
        const breathing = 0.92 + Math.sin(time * 0.00042 + particle.phase) * 0.08;
        const radius = maxRadius * particle.radius * breathing;
        const twist = particle.angle + particle.radius * 5.8 + Math.sin(particle.phase + time * 0.00018) * 0.18;
        const x = centerX + Math.cos(twist) * radius * xScale + pointerX * particle.depth * 11;
        const y = centerY + Math.sin(twist) * radius * yScale + Math.sin(twist * 2 + particle.phase) * radius * 0.075 + pointerY * particle.depth * 7;
        const alpha = (0.18 + particle.depth * 0.58) * (0.78 + Math.sin(time * 0.0014 + particle.phase) * 0.22);
        const radiusPx = particle.size * (0.72 + particle.depth * 0.58) * Math.min(energy, 1.8);
        const color = particle.warm ? "255, 202, 133" : index % 3 === 0 ? "194, 255, 248" : "124, 211, 255";
        if (particle.previousX && !reduceMotion.matches) {
          context.beginPath();
          context.moveTo(particle.previousX, particle.previousY);
          context.lineTo(x, y);
          context.strokeStyle = `rgba(${color}, ${alpha * 0.42})`;
          context.lineWidth = Math.max(0.45, radiusPx * 0.58);
          context.stroke();
        }
        context.beginPath();
        context.arc(x, y, radiusPx, 0, Math.PI * 2);
        context.fillStyle = `rgba(${color}, ${alpha})`;
        context.shadowColor = `rgba(${color}, ${Math.min(0.9, alpha + 0.22)})`;
        context.shadowBlur = 5 + particle.depth * 10;
        context.fill();
        context.shadowBlur = 0;
        particle.previousX = x;
        particle.previousY = y;
      });

      const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.25);
      core.addColorStop(0, `rgba(225, 255, 252, ${0.2 + Math.min(energy, 2) * 0.08})`);
      core.addColorStop(0.18, "rgba(94, 225, 244, 0.13)");
      core.addColorStop(1, "rgba(38, 128, 190, 0)");
      context.fillStyle = core;
      context.fillRect(centerX - maxRadius * 0.3, centerY - maxRadius * 0.3, maxRadius * 0.6, maxRadius * 0.6);
      if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    resize();
    draw(lastTime);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [variant]);

  return <canvas className={`particle-vortex-canvas particle-vortex-${variant} ${className}`.trim()} ref={canvasRef} aria-hidden="true" />;
}
