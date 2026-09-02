import { useEffect, useRef } from "react";

type RippleKind = "click" | "trail";

type Point = {
  x: number;
  y: number;
  time: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isInterfaceElement(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    "[data-ripple-block], button, a, input, textarea, select, option, label, [role='button']",
  ));
}

export default function BackgroundRipples({ active, intensity = 1 }: { active: boolean; intensity?: number }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const scene = document.getElementById("app-scene");
    if (!active || !layer || !scene) return;

    const timers = new Set<number>();
    let animationFrame = 0;
    let pendingMove: { x: number; y: number; target: EventTarget | null; pointerType: string; time: number } | null = null;
    let lastPointer: Point | null = null;
    let lastEmission: Point | null = null;

    const removeNode = (node: HTMLElement) => {
      node.remove();
    };

    const spawn = (kind: RippleKind, x: number, y: number, size: number, strength: number, angle = 0) => {
      const selector = kind === "click" ? ".water-ripple-click" : ".water-ripple-trail";
      const limit = kind === "click" ? 7 : 15;
      const existing = layer.querySelectorAll<HTMLElement>(selector);
      if (existing.length >= limit) existing[0]?.remove();

      const ripple = document.createElement("span");
      ripple.className = kind === "click" ? "water-ripple-click" : "water-ripple-trail";
      ripple.style.setProperty("--ripple-x", `${x}px`);
      ripple.style.setProperty("--ripple-y", `${y}px`);
      ripple.style.setProperty("--ripple-size", `${size}px`);
      ripple.style.setProperty("--ripple-strength", strength.toFixed(3));
      ripple.style.setProperty("--ripple-angle", `${angle}deg`);
      ripple.addEventListener("animationend", () => removeNode(ripple), { once: true });
      layer.appendChild(ripple);

      const timer = window.setTimeout(() => {
        timers.delete(timer);
        removeNode(ripple);
      }, kind === "click" ? 2100 : 1000);
      timers.add(timer);
    };

    const localPoint = (clientX: number, clientY: number) => {
      const bounds = scene.getBoundingClientRect();
      return { x: clientX - bounds.left, y: clientY - bounds.top };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isInterfaceElement(event.target)) return;
      const point = localPoint(event.clientX, event.clientY);
      const viewportScale = clamp(Math.min(scene.clientWidth, scene.clientHeight) / 800, 0.72, 1.25);
      spawn("click", point.x, point.y, 390 * viewportScale * clamp(intensity, 0.8, 1.35), clamp(0.78 * intensity, 0.5, 1));
    };

    const paintMove = () => {
      animationFrame = 0;
      const move = pendingMove;
      pendingMove = null;
      if (!move || move.pointerType !== "mouse" || isInterfaceElement(move.target)) {
        lastPointer = null;
        lastEmission = null;
        return;
      }

      const current = { x: move.x, y: move.y, time: move.time };
      if (!lastPointer) {
        lastPointer = current;
        lastEmission = current;
        return;
      }

      const sampleDistance = Math.hypot(current.x - lastPointer.x, current.y - lastPointer.y);
      const sampleTime = Math.max(12, current.time - lastPointer.time);
      const speed = sampleDistance / sampleTime;
      lastPointer = current;

      const origin = lastEmission || current;
      const emissionDistance = Math.hypot(current.x - origin.x, current.y - origin.y);
      const emissionTime = current.time - origin.time;
      const distanceThreshold = clamp(32 - speed * 7, 18, 32);
      if (emissionDistance < distanceThreshold || emissionTime < 44) return;

      const angle = Math.atan2(current.y - origin.y, current.x - origin.x) * 180 / Math.PI;
      const strength = clamp((0.16 + speed * 0.26) * intensity, 0.17, 0.72);
      const size = clamp((48 + speed * 36) * intensity, 50, 138);
      spawn("trail", current.x, current.y, size, strength, angle);
      lastEmission = current;
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event.clientX, event.clientY);
      pendingMove = { ...point, target: event.target, pointerType: event.pointerType, time: performance.now() };
      if (!animationFrame) animationFrame = window.requestAnimationFrame(paintMove);
    };

    const onPointerLeave = () => {
      pendingMove = null;
      lastPointer = null;
      lastEmission = null;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    scene.addEventListener("pointerdown", onPointerDown, { passive: true });
    scene.addEventListener("pointermove", onPointerMove, { passive: true });
    scene.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      scene.removeEventListener("pointerdown", onPointerDown);
      scene.removeEventListener("pointermove", onPointerMove);
      scene.removeEventListener("pointerleave", onPointerLeave);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
      layer.replaceChildren();
    };
  }, [active, intensity]);

  return <div ref={layerRef} className={`water-ripple-layer ${intensity > 1.1 ? "is-intense" : ""}`} aria-hidden="true" data-testid="water-ripple-layer" />;
}
