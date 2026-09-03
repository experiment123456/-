import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Fingerprint, EyeOff, GitBranch, Scan } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { CapsuleId } from "../image-lab/types";
import TextType from "./ocean/TextType";
import DecryptedText from "./ocean/DecryptedText";

gsap.registerPlugin(ScrollTrigger);

interface OceanDashboardProps {
  onNavigate: (target: "home" | "innovation" | "image-lab" | "ocean") => void;
}

interface ModuleCard {
  id: CapsuleId;
  index: string;
  title: string;
  label: string;
  desc: string;
  color: string;
  glow: string;
  icon: typeof Scan;
}

// 四个安全功能模块（去掉旧「海底舱」命名，用用户确认的正式名）。
const MODULES: ModuleCard[] = [
  { id: "redaction", index: "01", title: "局部隐私脱敏", label: "PRIVACY REDACTION", desc: "手动框选 · 二维码识别 · 局部 AES-GCM", color: "#A78BFA", glow: "rgba(167,139,250,0.5)", icon: Scan },
  { id: "watermark", index: "02", title: "数字水印与版权取证", label: "WATERMARK & PROOF", desc: "嵌入水印 · SM2 签发 · 泄露溯源", color: "#FBBF24", glow: "rgba(251,191,36,0.5)", icon: Fingerprint },
  { id: "stego", index: "03", title: "隐写攻防", label: "STEGO LAB", desc: "LSB 隐写 · PSNR 评估 · 检测评分", color: "#60A5FA", glow: "rgba(96,165,250,0.5)", icon: EyeOff },
  { id: "orchestrator", index: "04", title: "自适应密码编排", label: "ADAPTIVE CRYPTO", desc: "规则引擎 · 按文件特征推荐策略", color: "#34D399", glow: "rgba(52,211,153,0.5)", icon: GitBranch },
];

const CARD_STEP = 360 / MODULES.length;
const AUTO_STEP = 0.045; // deg per frame, slow drift
const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function OceanDashboard({ onNavigate }: OceanDashboardProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const hubRef = useRef<HTMLElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const rotationRef = useRef(0);
  const targetRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRotRef = useRef(0);
  const dragMovedRef = useRef(0);

  const [reduced, setReduced] = useState(false);

  const openModule = (id: CapsuleId) => {
    try {
      sessionStorage.setItem("image-lab-tab", id);
    } catch {
      /* sessionStorage 不可用时忽略，回落到默认 tab */
    }
    onNavigate("image-lab");
  };

  const scrollToHub = () => {
    const scroller = scrollerRef.current;
    const hub = hubRef.current;
    if (!scroller || !hub) return;
    scroller.scrollTo({ top: hub.offsetTop, behavior: "smooth" });
  };

  const scrollToHero = () => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 计算把第 i 张卡转到正面所需的目标旋转角（就近取整圈）。
  const focusCard = (i: number) => {
    const current = rotationRef.current;
    const ideal = -(i * CARD_STEP);
    const k = Math.round((current - ideal) / 360);
    targetRef.current = ideal + k * 360;
  };

  // 3D 环转 + 每帧朝向计算（GSAP ticker 驱动，pointer 拖拽 + 自动巡航）。
  useEffect(() => {
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);
    const stage = stageRef.current;
    const cards = cardRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!stage || cards.length === 0) return;

    const applyRotation = () => {
      const rot = rotationRef.current;
      stage.style.transform = `translateZ(calc(var(--oc-radius) * -1)) rotateY(${rot}deg)`;
      cards.forEach((card, i) => {
        const world = ((i * CARD_STEP + rot) * Math.PI) / 180;
        const facing = Math.cos(world); // 1 = 正对, -1 = 背对
        const opacity = 0.16 + ((facing + 1) / 2) * 0.84;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(Math.round(facing * 100) + 200);
        card.style.pointerEvents = facing > 0.1 ? "auto" : "none";
        card.classList.toggle("is-front", facing > 0.86);
      });
    };

    applyRotation();

    if (isReduced) {
      // 降级：静止环，正面第一张，仍可点击箭头切换。
      return;
    }

    const tick = () => {
      if (draggingRef.current) {
        applyRotation();
        return;
      }
      if (targetRef.current !== null) {
        const diff = targetRef.current - rotationRef.current;
        if (Math.abs(diff) < 0.05) {
          rotationRef.current = targetRef.current;
          targetRef.current = null;
        } else {
          rotationRef.current += diff * 0.1;
        }
        applyRotation();
        return;
      }
      if (!pausedRef.current) {
        rotationRef.current += AUTO_STEP;
        applyRotation();
      }
    };

    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  // GSAP ScrollTrigger：入场时间线 + 双幕过渡 + Hub 揭示（scroller 用内部滚动容器）。
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const ctx = gsap.context(() => {
      // Act 1 入场
      gsap.from(".oc2-hero-stagger", {
        y: 34,
        opacity: 0,
        filter: "blur(10px)",
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.14,
        delay: 0.15,
      });

      // Act 1 内容随滚动淡出上移
      gsap.to(".oc2-hero-inner", {
        y: -80,
        opacity: 0,
        ease: "none",
        scrollTrigger: {
          scroller,
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      // 水母背景视差
      gsap.to(".oc2-hub-media", {
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          scroller,
          trigger: hubRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      // Hub 揭示：环容器缩放淡入
      gsap.from(".oc2-orbit", {
        opacity: 0,
        scale: 0.82,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: {
          scroller,
          trigger: hubRef.current,
          start: "top 55%",
        },
      });

      gsap.from(".oc2-hub-aside > *", {
        x: -32,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          scroller,
          trigger: hubRef.current,
          start: "top 55%",
        },
      });
    }, scrollerRef);

    return () => ctx.revert();
  }, []);

  // Pointer 拖拽旋转
  const onPointerDown = (e: React.PointerEvent) => {
    if (reduced) return;
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRotRef.current = rotationRef.current;
    dragMovedRef.current = 0;
    targetRef.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartXRef.current;
    dragMovedRef.current = Math.max(dragMovedRef.current, Math.abs(dx));
    rotationRef.current = dragStartRotRef.current + dx * 0.35;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleCardClick = (i: number, id: CapsuleId) => {
    if (dragMovedRef.current > 6) return; // 拖拽结束不误触
    const rot = rotationRef.current;
    const world = ((i * CARD_STEP + rot) * Math.PI) / 180;
    const facing = Math.cos(world);
    if (facing > 0.86) openModule(id);
    else focusCard(i);
  };

  const rotateBy = (dir: 1 | -1) => {
    const base = targetRef.current ?? rotationRef.current;
    targetRef.current = Math.round(base / CARD_STEP) * CARD_STEP + dir * CARD_STEP;
  };

  return (
    <div className="oc2-root" data-agent-id="ocean.root" ref={scrollerRef}>
      {/* ============ 第一幕：光束 + 鱼群 + 打字 ============ */}
      <section className="oc2-act oc2-hero" ref={heroRef}>
        <video
          className="oc2-hero-media"
          autoPlay
          muted
          loop
          playsInline
          poster="/assets/ocean/hero-beam-poster.jpg"
          src="/assets/ocean/hero-beam-loop.mp4"
          aria-hidden="true"
        />
        <div className="oc2-hero-scrim" aria-hidden="true" />
        <div className="film-grain pointer-events-none absolute inset-0 z-[2]" aria-hidden="true" />

        <header className="oc2-topbar" data-ripple-block>
          <button className="oc2-chip liquid-glass" type="button" onClick={() => onNavigate("innovation")}>
            <ArrowLeft size={15} /> 返回创新页
          </button>
          <button className="oc2-chip liquid-glass" data-agent-id="ocean.open-lab" type="button" onClick={() => onNavigate("image-lab")}>
            打开操作台 <ArrowRight size={15} />
          </button>
        </header>

        <div className="oc2-hero-inner" data-ripple-block>
          <p className="oc2-eyebrow oc2-hero-stagger">深海 · 图像安全</p>
          <h1 className="oc2-hero-title oc2-hero-stagger">
            {reduced ? (
              "Image Security Lab"
            ) : (
              <TextType
                as="span"
                text={["Image Security Lab", "隐私 · 水印 · 隐写 · 编排"]}
                typingSpeed={70}
                pauseDuration={2200}
                deletingSpeed={38}
                cursorCharacter="▍"
                cursorClassName="oc2-cursor"
                className="oc2-type"
              />
            )}
          </h1>
          <p className="oc2-hero-sub oc2-hero-stagger">
            在同一片深海里完成局部脱敏、数字水印、隐写攻防与自适应密码编排。
          </p>
          <div className="oc2-hero-cta oc2-hero-stagger">
            <button className="oc2-btn-primary" data-agent-id="ocean.enter" type="button" onClick={scrollToHub}>
              进入功能矩阵 <ChevronDown size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ============ 第二幕：漩涡 + 4 卡环转 ============ */}
      <section className="oc2-act oc2-hub" data-agent-id="ocean.hub" ref={hubRef}>
        <video
          className="oc2-hub-media"
          autoPlay
          muted
          loop
          playsInline
          poster="/assets/ocean/jellyfish-poster.jpg"
          src="/assets/ocean/jellyfish-bg.mp4"
          aria-hidden="true"
        />
        <div className="oc2-hub-scrim" aria-hidden="true" />

        <div className="oc2-hub-grid">
          <aside className="oc2-hub-aside" data-ripple-block>
            <button className="oc2-chip liquid-glass oc2-hub-back" type="button" onClick={scrollToHero}>
              <ChevronDown size={15} style={{ transform: "rotate(180deg)" }} /> 返回上一幕
            </button>
            <p className="oc2-eyebrow">Security Modules</p>
            <h2 className="oc2-hub-title">选择安全功能</h2>
            <p className="oc2-hub-sub">
              拖动漩涡或用箭头旋转，点击正面的卡片进入对应实验。四个模块共享同一套密码引擎。
            </p>
            <div className="oc2-hub-controls">
              <button className="oc2-arrow liquid-glass" data-agent-id="ocean.previous" type="button" onClick={() => rotateBy(-1)} aria-label="上一个模块">
                <ChevronLeft size={18} />
              </button>
              <button className="oc2-arrow liquid-glass" data-agent-id="ocean.next" type="button" onClick={() => rotateBy(1)} aria-label="下一个模块">
                <ChevronRight size={18} />
              </button>
            </div>
          </aside>

          <div className="oc2-stage-wrap" data-agent-id="ocean.cards">
            {/* 纯 CSS/SVG 漩涡光环（无人物） */}
            <div className="oc2-vortex" aria-hidden="true">
              <span className="oc2-vortex-ring r1" />
              <span className="oc2-vortex-ring r2" />
              <span className="oc2-vortex-ring r3" />
              <span className="oc2-vortex-core" />
            </div>

            <div
              className="oc2-orbit"
              ref={orbitRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-ripple-block
            >
              <div className="oc2-stage" ref={stageRef}>
                {MODULES.map((m, i) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`oc2-card oc2-card-${m.id}`}
                      style={{ "--i": i, "--c": m.color, "--g": m.glow } as React.CSSProperties}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      onClick={() => handleCardClick(i, m.id)}
                    >
                      <div className="oc2-card-cover">
                        <span className="oc2-card-icon">
                          <Icon size={30} />
                        </span>
                        <span className="oc2-card-index">{m.index}</span>
                      </div>
                      <div className="oc2-card-body">
                        <b className="oc2-card-title">{m.title}</b>
                        <span className="oc2-card-label">
                          {reduced ? (
                            m.label
                          ) : (
                            <DecryptedText
                              text={m.label}
                              animateOn="hover"
                              speed={38}
                              maxIterations={12}
                              className="oc2-card-label-on"
                              encryptedClassName="oc2-card-label-off"
                            />
                          )}
                        </span>
                        <span className="oc2-card-desc">{m.desc}</span>
                        <span className="oc2-card-enter">
                          进入实验 <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 移动端降级：环转不适合小屏，改为竖向卡片列表 */}
        <div className="oc2-mobile-list" data-ripple-block>
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                className="oc2-mcard workspace-card"
                style={{ "--c": m.color, "--g": m.glow } as React.CSSProperties}
                onClick={() => openModule(m.id)}
              >
                <span className="oc2-mcard-icon">
                  <Icon size={22} />
                </span>
                <span className="oc2-mcard-text">
                  <b>{m.title}</b>
                  <small>{m.label}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
