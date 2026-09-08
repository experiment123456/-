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
  const videoReadyRef = useRef(false);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
    if (fast && flash && !reducedMotion) {
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

    const setFinalPoster = () => {
      gsap.set(root.querySelectorAll(".wc-tile"), { opacity: 1, xPercent: 0, rotateY: 0, filter: "blur(0px)" });
      gsap.set(root.querySelector(".wc-core"), { opacity: 1, scale: 1, filter: "blur(0px)" });
      gsap.set(root.querySelectorAll(".wc-fade"), { opacity: 1, y: 0 });
    };

    // 减动效：直接呈现"画布+标题"海报构图，短暂停留后淡入主页面
    if (reducedMotion) {
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
        .to(videoRef.current, { opacity: 0, duration: 0.8 }, "unfold")
        .call(() => videoRef.current?.pause(), undefined, "unfold+=0.85");

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
        .fromTo(".wc-hint", { opacity: 0 }, { opacity: 0.9, duration: 0.6 }, "decrypt+=1.2")
        .to(".wc-hint", { opacity: 0.55, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: -1 }, "decrypt+=1.8");

      // 进度条 = 时间轴进度
      tl.fromTo(".wc-progress", { scaleX: 0 }, { scaleX: 1, duration: PHASES.total, ease: "none" }, 0);

      // reveal：镜头穿过画布 → 通知 App 放大真实主页面 → 退出
      tl.fromTo(flashRef.current, { opacity: 0 }, { opacity: 0.9, duration: 0.8, ease: "power2.in" }, "reveal+=0.1")
        .call(() => onRevealRef.current?.(), undefined, "reveal")
        .to(flashRef.current, { opacity: 0, duration: 0.3 }, `reveal+=${PHASES.total - PHASES.decryptEnd - 0.35}`)
        .call(() => dismiss(false), undefined, PHASES.total);
    }, root);

    // 视频看门狗：4s 仍未就绪则永久隐藏（程序化背景无缝顶替；ref 判定避免闭包过期值）
    const watchdog = window.setTimeout(() => {
      if (!videoReadyRef.current && videoRef.current) videoRef.current.style.display = "none";
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
      if (event.key === " ") event.preventDefault();
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
      {!reducedMotion && (
        <video
          ref={videoRef}
          className="wc-video"
          autoPlay
          muted
          loop
          playsInline
          src={VIDEO_SRC}
          style={{ visibility: videoReady ? "visible" : "hidden" }}
          onLoadedData={() => { videoReadyRef.current = true; setVideoReady(true); }}
          aria-hidden="true"
        />
      )}
      <canvas className="wc-canvas" aria-hidden="true" />
      <div className="wc-wash" aria-hidden="true" />
      <MosaicCollage />
      <div className="wc-flash" ref={flashRef} aria-hidden="true" />
      <div className="wc-content">
        <p className="wc-eyebrow wc-fade">Lumora · Cipher Laboratory</p>
        <h1 className={`wc-title${titleShown && !plainTitle ? " is-entering" : ""}`}>
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
