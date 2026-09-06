import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const names = [["MULTILITERAL", "CIPHER"], ["AUTOKEY", "CIPHERTEXT"], ["PLAYFAIR", "CIPHER"], ["DOUBLE", "TRANSPOSITION"], ["CELLULAR", "AUTOMATA"], ["AES-256", "GCM"], ["SM2"], ["SM3"], ["MD5"], ["DIFFIE", "HELLMAN"]];
type Point = { x: number; y: number };

export default function CipherPendulum() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  pauseRef.current = paused;
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 1, height = 1, frame = 0, clock = 0, last = 0, visible = true;
    let clouds: Point[][] = [];
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      element.width = width * dpr; element.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      clouds = names.map(lines => {
        const sample = document.createElement("canvas"); sample.width = 900; sample.height = 340;
        const ctx = sample.getContext("2d", { willReadFrequently: true })!;
        ctx.font = "900 108px Arial";
        const size = Math.min(126, 800 / Math.max(...lines.map(line => ctx.measureText(line).width)) * 108);
        ctx.font = `900 ${size}px Arial`; ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        lines.forEach((line, index) => ctx.fillText(line, 450, 170 + (index - (lines.length - 1) / 2) * size * 1.25));
        const pixels = ctx.getImageData(0, 0, 900, 340).data;
        const result: Point[] = [];
        for (let y = 0; y < 340; y += 6) for (let x = 0; x < 900; x += 6) if (pixels[(y * 900 + x) * 4 + 3] > 120) result.push({ x: x - 450, y: y - 170 });
        return result;
      });
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); intersection.observe(element);
    const draw = (now: number) => {
      const dt = Math.min(now - last, 50); last = now;
      const still = reduced.matches || Boolean(element.closest(".motion-reduced"));
      if (visible && !document.hidden && !pauseRef.current && !still) clock += dt;
      if (visible) {
        context.clearRect(0, 0, width, height);
        const index = Math.floor(clock / 4400) % names.length;
        const phase = (clock % 4400) / 4400;
        const transition = Math.max(0, (phase - .54) / .46);
        const ease = transition * transition * (3 - 2 * transition);
        const current = clouds[index], next = clouds[(index + 1) % names.length];
        const scale = Math.min(width / 1030, height / 530, 1.65);
        const swing = Math.sin(transition * Math.PI * 2) * .19;
        const count = Math.max(current.length, next.length);
        context.fillStyle = "#eeede5";
        for (let i = 0; i < count; i++) {
          const a = current[i % current.length], b = next[i % next.length];
          const x = a.x + (b.x - a.x) * ease;
          const y = a.y + (b.y - a.y) * ease;
          const angle = swing * Math.cos(x / 600) + Math.sin(transition * Math.PI) * (x / 900) * .32;
          const px = x * Math.cos(angle) - (y + 200) * Math.sin(angle);
          const py = x * Math.sin(angle) + (y + 200) * Math.cos(angle) - 200;
          context.globalAlpha = i < current.length && i < next.length ? 1 : i >= current.length ? ease : 1 - ease;
          context.beginPath(); context.arc(width / 2 + px * scale, height / 2 + py * scale, Math.max(.8, 1.8 * scale), 0, Math.PI * 2); context.fill();
        }
        context.globalAlpha = 1;
        element.setAttribute("aria-label", names[index].join(" "));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); };
  }, []);
  return <><canvas className="project-cipher-canvas" ref={canvas} role="img" aria-label="MULTILITERAL CIPHER" /><button className="project-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? "播放点阵动画" : "暂停点阵动画"} type="button">{paused ? <Play size={15} /> : <Pause size={15} />}</button></>;
}
