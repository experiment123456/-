import { useEffect, useRef, type CSSProperties } from "react";

type JellyStyle = CSSProperties & {
  "--jelly-size": string;
  "--jelly-opacity": string;
  "--jelly-delay": string;
};

type JellyAgent = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  cruise: number;
  alert: number;
};

const jellySpecs = [
  { size: 86, opacity: 0.82, delay: -1.7 },
  { size: 62, opacity: 0.62, delay: -3.2 },
  { size: 74, opacity: 0.74, delay: -0.8 },
  { size: 54, opacity: 0.54, delay: -4.1 },
  { size: 70, opacity: 0.68, delay: -2.5 },
  { size: 58, opacity: 0.58, delay: -5.4 },
];

function Jellyfish({ index }: { index: number }) {
  const spec = jellySpecs[index];
  const gradientId = `jelly-glass-${index}`;
  const glowId = `jelly-glow-${index}`;
  const style: JellyStyle = {
    "--jelly-size": `${spec.size}px`,
    "--jelly-opacity": String(spec.opacity),
    "--jelly-delay": `${spec.delay}s`,
  };

  return (
    <div className="ocean-jellyfish" data-jelly-index={index} style={style} aria-hidden="true">
      <div className="ocean-jellyfish-float">
        <svg viewBox="0 0 100 150" role="presentation">
          <defs>
            <radialGradient id={gradientId} cx="48%" cy="24%" r="72%">
              <stop offset="0" stopColor="white" stopOpacity="0.78" />
              <stop offset="0.38" stopColor="#e8fdff" stopOpacity="0.42" />
              <stop offset="0.76" stopColor="#9fe6ef" stopOpacity="0.16" />
              <stop offset="1" stopColor="#6ac7d6" stopOpacity="0.03" />
            </radialGradient>
            <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="3.4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <g className="jellyfish-body" filter={`url(#${glowId})`}>
            <path className="jellyfish-aura" d="M11 55C13 22 29 7 50 7s37 15 39 48c-8 10-21 15-39 15S19 65 11 55Z" fill={`url(#${gradientId})`} />
            <path className="jellyfish-bell" d="M15 56C17 27 31 13 50 13s33 14 35 43c-9-4-15 6-23 6-6 0-7-7-12-7s-7 7-13 7c-8 0-13-10-22-6Z" fill={`url(#${gradientId})`} />
            <ellipse className="jellyfish-highlight" cx="42" cy="28" rx="20" ry="12" fill="white" opacity="0.13" />
            <path className="jellyfish-rim" d="M16 55c10-4 14 7 22 7 6 0 7-7 12-7s6 7 12 7c8 0 13-11 22-7" fill="none" stroke="#efffff" strokeOpacity="0.48" strokeWidth="1.1" />

            <g className="jellyfish-tentacles" fill="none" strokeLinecap="round">
              <path d="M29 62C23 80 39 88 29 108c-5 10-3 22 2 31" stroke="#ecffff" strokeOpacity="0.43" strokeWidth="1.45" />
              <path d="M41 62c-8 22 8 31 0 51-5 12-2 22 4 32" stroke="#f5ffff" strokeOpacity="0.56" strokeWidth="1.25" />
              <path d="M51 61c7 17-5 28 1 44 6 15 0 27-4 40" stroke="#dffbff" strokeOpacity="0.48" strokeWidth="1.5" />
              <path d="M61 62c10 19-6 31 2 48 5 12 2 23-3 33" stroke="#edffff" strokeOpacity="0.52" strokeWidth="1.25" />
              <path d="M72 61c7 14-6 25 1 39 6 12 1 23-5 34" stroke="#d8f9ff" strokeOpacity="0.36" strokeWidth="1.15" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

export default function JellyfishField() {
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const agentsRef = useRef<JellyAgent[]>([]);
  const pointerRef = useRef({ x: -10_000, y: -10_000 });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const elements = Array.from(field.querySelectorAll<HTMLElement>(".ocean-jellyfish"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let bounds = field.getBoundingClientRect();

    const initialise = () => {
      bounds = field.getBoundingClientRect();
      const { width, height } = bounds;
      const lowerBand = Math.max(height * 0.64, height - 340);
      agentsRef.current = jellySpecs.map((spec, index) => {
        const column = (index + 0.55) / jellySpecs.length;
        const angle = 0.4 + index * 0.92;
        return {
          x: Math.max(8, Math.min(width - spec.size - 8, width * column + (index % 2 ? 24 : -30))),
          y: Math.max(lowerBand, Math.min(height - spec.size * 1.45, lowerBand + (index % 3) * 66 + index * 7)),
          vx: Math.cos(angle) * (0.16 + index * 0.018),
          vy: Math.sin(angle) * 0.1 - 0.025,
          phase: index * 1.41 + 0.35,
          size: spec.size,
          cruise: 0.24 + index * 0.018,
          alert: 0,
        };
      });
    };

    const movePointer = (event: PointerEvent) => {
      pointerRef.current.x = event.clientX - bounds.left;
      pointerRef.current.y = event.clientY - bounds.top;
    };
    const clearPointer = () => { pointerRef.current = { x: -10_000, y: -10_000 }; };

    initialise();
    if (reducedMotion) {
      agentsRef.current.forEach((agent, index) => {
        elements[index]?.style.setProperty("transform", `translate3d(${agent.x}px, ${agent.y}px, 0)`);
      });
      return;
    }

    let previous = performance.now();
    const animate = (time: number) => {
      const frameScale = Math.min(2.1, Math.max(0.35, (time - previous) / 16.667));
      const seconds = time / 1000;
      previous = time;

      agentsRef.current.forEach((agent, index) => {
        const element = elements[index];
        if (!element) return;

        const centerX = agent.x + agent.size * 0.5;
        const centerY = agent.y + agent.size * 0.68;
        const awayX = centerX - pointerRef.current.x;
        const awayY = centerY - pointerRef.current.y;
        const distance = Math.hypot(awayX, awayY);
        const dangerRadius = 138 + agent.size * 0.35;

        if (distance < dangerRadius) {
          const force = (1 - distance / dangerRadius) * 0.92 + 0.12;
          const normalX = awayX / Math.max(distance, 1);
          const normalY = awayY / Math.max(distance, 1);
          agent.vx += normalX * force * frameScale;
          agent.vy += normalY * force * frameScale;
          agent.alert = Math.min(1, agent.alert + 0.16 * frameScale);
        } else {
          agent.alert *= Math.pow(0.955, frameScale);
          agent.vx += Math.cos(seconds * 0.38 + agent.phase) * 0.0052 * frameScale;
          agent.vy += (Math.sin(seconds * 0.31 + agent.phase) * 0.004 - 0.0008) * frameScale;
        }

        const damping = agent.alert > 0.08 ? 0.988 : 0.972;
        agent.vx *= Math.pow(damping, frameScale);
        agent.vy *= Math.pow(damping, frameScale);

        const maxSpeed = agent.cruise + agent.alert * 4.7;
        const currentSpeed = Math.hypot(agent.vx, agent.vy);
        if (currentSpeed > maxSpeed) {
          agent.vx = (agent.vx / currentSpeed) * maxSpeed;
          agent.vy = (agent.vy / currentSpeed) * maxSpeed;
        }

        agent.x += agent.vx * frameScale;
        agent.y += agent.vy * frameScale;

        const minY = Math.max(bounds.height * 0.62, bounds.height - 360);
        const maxX = Math.max(8, bounds.width - agent.size - 8);
        const maxY = Math.max(minY + 20, bounds.height - agent.size * 1.35 - 8);
        if (agent.x < 8) { agent.x = 8; agent.vx = Math.abs(agent.vx) * 0.72; }
        if (agent.x > maxX) { agent.x = maxX; agent.vx = -Math.abs(agent.vx) * 0.72; }
        if (agent.y < minY) { agent.y = minY; agent.vy = Math.abs(agent.vy) * 0.68; }
        if (agent.y > maxY) { agent.y = maxY; agent.vy = -Math.abs(agent.vy) * 0.68; }

        const tilt = Math.max(-10, Math.min(10, agent.vx * 2.2));
        const facing = agent.vx < 0 ? -1 : 1;
        element.style.transform = `translate3d(${agent.x.toFixed(2)}px, ${agent.y.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg) scaleX(${facing})`;
        element.style.setProperty("--jelly-alert", agent.alert.toFixed(3));
        element.style.setProperty("--jelly-motion", `${(4.6 - agent.alert * 2.35).toFixed(2)}s`);
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("pointermove", movePointer, { passive: true });
    window.addEventListener("blur", clearPointer);
    document.documentElement.addEventListener("mouseleave", clearPointer);
    window.addEventListener("resize", initialise, { passive: true });
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("blur", clearPointer);
      document.documentElement.removeEventListener("mouseleave", clearPointer);
      window.removeEventListener("resize", initialise);
    };
  }, []);

  return (
    <div ref={fieldRef} className="jellyfish-field" data-jellyfish-field aria-hidden="true">
      {jellySpecs.map((_, index) => <Jellyfish key={index} index={index} />)}
    </div>
  );
}
