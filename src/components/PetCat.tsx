import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Pause, Play, X } from "lucide-react";
import "./PetCat.css";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type Mood = "idle" | "walk" | "happy" | "play" | "sleep";
type Props = { surface: "showcase" | "chat"; atEnd?: boolean; busy?: boolean; onClose: () => void };
const margin = 8;
const obstacles = ".agent-use-nav, .agent-use-workspace, .agent-use-footer, .agent-corner-gif, .agent-history, .agent-showcase-header, .agent-showcase-hint, .agent-showcase-bottom-entry";
const intersects = (a: Box, b: Box, padding = 6) => a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function CatDrawing() {
  return <svg className="pet-cat-art" viewBox="0 0 120 104" fill="none" aria-hidden="true">
    <ellipse cx="60" cy="98" rx="38" ry="4" fill="#704b30" opacity=".14" />
    <g className="pet-cat-body" stroke="#9e714e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path className="pet-cat-tail" d="M87 85C113 90 116 67 106 62C97 58 97 72 104 73" stroke="#9e714e" strokeWidth="13" />
      <path className="pet-cat-tail" d="M87 85C113 90 116 67 106 62C97 58 97 72 104 73" stroke="#edcfa0" strokeWidth="9" />
      <ellipse cx="60" cy="77" rx="30" ry="21" fill="#f5ddb4" />
      <ellipse cx="60" cy="79" rx="17" ry="16" fill="#fff3db" stroke="none" />
      <g className="pet-cat-paw pet-cat-paw--left"><path d="M38 82v8c-12 1-12 10 1 10h11V84" fill="#fff0d3" /><path d="M36 94v3m6-3v3" strokeWidth="1.2" /></g>
      <g className="pet-cat-paw pet-cat-paw--right"><path d="M70 84v16h11c13 0 13-9 1-10v-8" fill="#fff0d3" /><path d="M78 94v3m6-3v3" strokeWidth="1.2" /></g>
      <g className="pet-cat-head">
        <path d="M27 36L21 9Q23 3 43 21M78 21Q99 2 99 10L94 38" fill="#f5ddb4" />
        <path d="M28 15l3 17 11-7M90 15l-11 10 11 8" fill="#edb4ac" stroke="none" />
        <path d="M25 39c0-16 15-24 35-24s36 9 36 25c10 31-10 39-36 39S15 67 25 39Z" fill="#ffebc7" />
        <path d="M50 17l3 9m7-10v10m10-9-3 9" stroke="#d8ab74" strokeWidth="4" />
        <path d="M40 65q20-11 40 0c-7 12-31 14-40 0" fill="#fff7e8" stroke="none" />
        <g className="pet-cat-eyes"><ellipse cx="44" cy="48" rx="5" ry="7" fill="#364d49" stroke="none" /><ellipse cx="77" cy="48" rx="5" ry="7" fill="#364d49" stroke="none" /><circle cx="45" cy="46" r="1.8" fill="white" stroke="none" /><circle cx="78" cy="46" r="1.8" fill="white" stroke="none" /></g>
        <g className="pet-cat-closed-eyes"><path d="M38 50q6-7 12 0m21 0q6-7 12 0" strokeWidth="2.5" /></g>
        <ellipse cx="33" cy="59" rx="7" ry="3.5" fill="#efa8a0" opacity=".65" stroke="none" /><ellipse cx="88" cy="59" rx="7" ry="3.5" fill="#efa8a0" opacity=".65" stroke="none" />
        <path d="m57 57 4 3 4-3" fill="#c58678" stroke="#c58678" /><path d="M61 60v3m-6 0q3 5 6 0 3 5 6 0" strokeWidth="1.5" />
        <path d="m19 55 12 2m-13 6 12-2m62-4 11-2m-11 6 12 2" strokeWidth="1.3" opacity=".65" />
      </g>
      <path d="M44 78q17 6 33 0" stroke="#72a8a0" strokeWidth="4" /><circle cx="61" cy="82" r="4.5" fill="#e6b45d" strokeWidth="1.2" /><path d="M61 82v2" strokeWidth="1.1" />
    </g>
    <g className="pet-cat-hearts" fill="#e49998"><path d="M13 27c-9-6-3-13 2-8 6-5 11 3-2 8Z" /><path d="M99 18c-7-5-2-11 2-7 5-4 9 2-2 7Z" /></g>
    <g className="pet-cat-yarn"><circle cx="20" cy="90" r="9" fill="#92beb7" stroke="#5c918a" strokeWidth="1.5" /><path d="M13 84q10 0 13 11m-15-5q8-8 15-1m-13 7q7-3 8-14" stroke="#d3e7dd" strokeWidth="1.4" /></g>
    <text className="pet-cat-zzz" x="91" y="29" fill="#b99059" fontSize="13" fontFamily="sans-serif">z Z</text>
  </svg>;
}

export default function PetCat({ surface, atEnd = false, busy = false, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [mood, setMood] = useState<Mood>("idle");
  const [speech, setSpeech] = useState("");
  const props = useRef({ paused, atEnd, busy });
  props.current = { paused, atEnd, busy };
  const engine = useRef({
    position: { x: 8, y: 160 }, size: { width: 104, height: 114 }, blocked: [] as Box[],
    target: null as Point | null, pointer: { x: -1000, y: -1000 }, pointerTime: 0,
    hover: false, dragging: false, nextMove: 0, emotionUntil: 0, speechUntil: 0,
    nextHint: 0, hints: 0, lastInput: 0, currentMood: "idle" as Mood,
  });
  const gesture = useRef<{ id: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const stroke = useRef({ x: 0, y: 0, amount: 0, time: 0 });
  const suppressClick = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { if (preference.matches) setPaused(true); };
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const react = (play = false) => {
    const now = performance.now();
    const e = engine.current;
    e.emotionUntil = now + 2800;
    e.speechUntil = now + 4200;
    e.nextMove = now + 5000;
    e.currentMood = play ? "play" : "happy";
    setMood(e.currentMood);
    setSpeech(play ? "抓到毛线球啦！再陪我玩一下嘛～" : "呼噜呼噜～摸摸头。♥");
  };

  useEffect(() => {
    const pet = root.current;
    if (!pet) return;
    const e = engine.current;
    const started = performance.now();
    e.nextMove = started + 1800;
    e.nextHint = started + 12000;
    e.lastInput = started;
    let frame = 0;
    let last = started;
    let lastScan = -Infinity;
    let placed = false;
    let stopped = false;
    const fits = (p: Point, size = e.size) => p.x >= margin && p.y >= margin && p.x + size.width <= innerWidth - margin && p.y + size.height <= innerHeight - margin && !e.blocked.some((box) => intersects({ ...p, ...size }, box));
    const safePet = (p: Point) => fits(p) && (surface !== "showcase" || p.x <= 40 || p.x >= innerWidth - e.size.width - 40);
    const paint = () => { pet.style.transform = `translate3d(${e.position.x}px, ${e.position.y}px, 0)`; };
    const candidates = () => {
      const points: Point[] = [];
      for (let y = margin; y <= innerHeight - e.size.height - margin; y += 16) {
        for (let x = margin; x <= innerWidth - e.size.width - margin; x += 16) {
          if (surface === "showcase" && x > 40 && x < innerWidth - e.size.width - 40) continue;
          if (safePet({ x, y })) points.push({ x, y });
        }
      }
      return points;
    };
    const scan = () => {
      e.size = { width: pet.offsetWidth, height: pet.offsetHeight };
      e.blocked = Array.from(document.querySelectorAll<HTMLElement>(obstacles)).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height ? [{ x: rect.left, y: rect.top, width: rect.width, height: rect.height }] : [];
      });
      if (!e.dragging && (!placed || !safePet(e.position))) {
        const points = candidates();
        const preferred = placed ? e.position : { x: surface === "chat" && innerWidth < 761 ? innerWidth - 100 : 8, y: surface === "chat" && innerWidth < 761 ? 90 : innerHeight * 0.6 };
        points.sort((a, b) => distance(a, preferred) - distance(b, preferred));
        if (points[0]) { e.position = points[0]; placed = true; e.target = null; paint(); }
        // Very small windows may have no unobstructed space; never cover controls.
        pet.style.visibility = points[0] ? "visible" : "hidden";
      }
    };
    const clearPath = (target: Point) => {
      const steps = Math.ceil(distance(e.position, target) / 8);
      for (let i = 1; i <= steps; i++) {
        if (!safePet({ x: e.position.x + (target.x - e.position.x) * i / steps, y: e.position.y + (target.y - e.position.y) * i / steps })) return false;
      }
      return true;
    };
    const arrangeBubble = () => {
      if (!bubble.current) return;
      const node = bubble.current;
      const p = e.position;
      for (const width of [innerWidth < 761 ? 158 : 184, 144, 128]) {
        node.style.width = `${width}px`;
        const size = { width: node.offsetWidth, height: node.offsetHeight };
        const options = [
          { x: p.x + e.size.width + 10, y: p.y + 20 },
          { x: p.x - size.width - 10, y: p.y + 20 },
          { x: p.x, y: p.y - size.height - 10 },
          { x: p.x, y: p.y + e.size.height + 10 },
        ];
        const point = options.find((option) => fits(option, size));
        if (point) {
          node.style.visibility = "visible";
          node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
          return;
        }
      }
      node.style.visibility = "hidden";
    };
    const changeMood = (next: Mood) => { if (e.currentMood !== next) { e.currentMood = next; setMood(next); } };
    const typing = () => document.activeElement?.matches("input, textarea, [contenteditable='true']");
    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (now - lastScan > 700) { scan(); lastScan = now; }
      const near = now - e.pointerTime < 2500 && distance(e.pointer, { x: e.position.x + e.size.width / 2, y: e.position.y + e.size.height / 2 }) < 120;
      const quiet = props.current.busy || typing() || document.hidden;
      if (quiet && e.speechUntil) { e.speechUntil = 0; setSpeech(""); }
      if (now > e.speechUntil && e.speechUntil) { e.speechUntil = 0; setSpeech(""); }
      if (e.emotionUntil > now) { /* Let the short petting/play animation finish. */ }
      else if (e.dragging || e.hover || near || pet.querySelector(":focus-visible") || props.current.paused || quiet) changeMood("idle");
      else {
        if (!e.target && now > e.nextMove) {
          const options = candidates().filter((p) => distance(p, e.position) > 32 && distance(p, e.position) < 240 && clearPath(p));
          e.target = options[Math.floor(Math.random() * options.length)] || null;
          e.nextMove = now + 3500 + Math.random() * 2500;
        }
        if (e.target) {
          const length = distance(e.position, e.target);
          const step = Math.min(length, dt * (surface === "chat" ? 14 : 24));
          const next = { x: e.position.x + (e.target.x - e.position.x) / (length || 1) * step, y: e.position.y + (e.target.y - e.position.y) / (length || 1) * step };
          if (safePet(next)) { pet.style.setProperty("--pet-facing", e.target.x < e.position.x ? "-1" : "1"); e.position = next; paint(); changeMood("walk"); }
          else e.target = null;
          if (length < 2) { e.target = null; e.nextMove = now + 4500; changeMood("sleep"); }
        } else changeMood("sleep");
      }
      if (!quiet && pet.style.visibility === "visible" && !e.dragging && !e.hover && e.hints < 3 && now >= e.nextHint && now - e.lastInput > 8000) {
        setSpeech(surface === "chat" ? "有好奇的问题吗？可以问问 Agent 喵～" : props.current.atEnd ? "到啦！点「进入 Agent 对话」聊聊吧～" : "往下滑一滑，还有惊喜等着你喵～");
        e.speechUntil = now + 6000;
        e.nextHint = now + 60000;
        e.hints++;
      }
      arrangeBubble();
      frame = requestAnimationFrame(tick);
    };
    const pointer = (event: PointerEvent) => { e.pointer = { x: event.clientX, y: event.clientY }; e.pointerTime = performance.now(); };
    const input = () => { e.lastInput = performance.now(); };
    const resize = () => { lastScan = -Infinity; e.target = null; };
    const clearPointer = () => { e.pointerTime = -Infinity; e.hover = false; };
    // The showcase lives in a same-origin iframe; observe without consuming events.
    const iframe = document.querySelector<HTMLIFrameElement>(".agent-showcase-frame");
    let inner: Window | null = null;
    const detachFrame = () => {
      try { inner?.removeEventListener("pointermove", pointer as EventListener); inner?.removeEventListener("wheel", input); inner?.removeEventListener("pointerdown", input); } catch { /* The frame may have navigated away. */ }
    };
    const attachFrame = () => { detachFrame(); inner = iframe?.contentWindow || null; try { inner?.addEventListener("pointermove", pointer as EventListener, { passive: true }); inner?.addEventListener("wheel", input, { passive: true }); inner?.addEventListener("pointerdown", input, { passive: true }); } catch { inner = null; } };
    attachFrame();
    iframe?.addEventListener("load", attachFrame);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("pointerdown", input, { passive: true });
    window.addEventListener("keydown", input);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clearPointer);
    document.addEventListener("scroll", resize, true);
    scan();
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true; cancelAnimationFrame(frame); detachFrame(); iframe?.removeEventListener("load", attachFrame);
      window.removeEventListener("pointermove", pointer); window.removeEventListener("pointerdown", input);
      window.removeEventListener("keydown", input); window.removeEventListener("resize", resize); window.removeEventListener("blur", clearPointer);
      document.removeEventListener("scroll", resize, true);
    };
  }, [surface]);

  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { ...engine.current.position }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    const drag = gesture.current;
    const e = engine.current;
    if (drag && drag.id === event.pointerId) {
      drag.moved ||= distance(point, drag.start) > 6;
      if (!drag.moved) return;
      suppressClick.current = true;
      e.dragging = true; e.target = null;
      e.position = { x: Math.max(margin, Math.min(innerWidth - e.size.width - margin, drag.origin.x + point.x - drag.start.x)), y: Math.max(margin, Math.min(innerHeight - e.size.height - margin, drag.origin.y + point.y - drag.start.y)) };
      if (root.current) root.current.style.transform = `translate3d(${e.position.x}px, ${e.position.y}px, 0)`;
    } else if (event.pointerType === "mouse") {
      const now = performance.now();
      const last = stroke.current;
      last.amount = now - last.time < 500 ? last.amount + distance(point, last) : 0;
      Object.assign(last, point, { time: now });
      if (last.amount > 42 && now > e.emotionUntil) { last.amount = 0; react(); }
    }
  };
  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    suppressClick.current = gesture.current.moved;
    gesture.current = null;
    engine.current.dragging = false;
    engine.current.nextMove = performance.now() + 3500;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <>
    <div ref={root} className="pet-cat" data-mood={mood} data-paused={paused} data-ripple-block onPointerEnter={() => { engine.current.hover = true; }} onPointerLeave={() => { engine.current.hover = false; }}>
      <div className="pet-cat-controls">
        <button type="button" aria-label={paused ? "让小猫自动散步" : "暂停小猫散步"} title={paused ? "开始散步" : "暂停散步"} onClick={() => setPaused(!paused)}>{paused ? <Play /> : <Pause />}</button>
        <button type="button" aria-label="用毛线球逗小猫" title="陪小猫玩" onClick={() => react(true)}><Circle /></button>
        <button type="button" aria-label="关闭小猫" title="关闭小猫" onClick={onClose}><X /></button>
      </div>
      <button className="pet-cat-touch" type="button" aria-label="抚摸糯米小猫，可拖动" title="摸摸头，或拖动带我散步" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onClick={() => { if (!suppressClick.current) react(); suppressClick.current = false; }}><CatDrawing /></button>
    </div>
    {speech && <div ref={bubble} className="pet-cat-speech" role="status" aria-live="polite"><b>糯米 <span>· 你的学习小搭子</span></b><p>{speech}</p></div>}
  </>;
}
