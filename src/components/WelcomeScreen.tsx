import { useCallback, useEffect, useRef, useState } from "react";
import WelcomeAbyssCanvas from "./WelcomeAbyssCanvas";

export default function WelcomeScreen({ onDismiss }: { onDismiss: () => void }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const leavingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setIsLeaving(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(dismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [dismiss]);

  useEffect(() => {
    if (isLeaving) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLeaving, dismiss]);

  return (
    <div
      className={`welcome-screen${isLeaving ? " is-leaving" : ""}`}
      onClick={dismiss}
      role="button"
      tabIndex={0}
      aria-label="欢迎页，点击任意位置进入"
      onAnimationEnd={(event) => {
        // animationend 会从子元素冒泡上来，只认根元素自己的退出动画
        if (isLeaving && event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="welcome-base" aria-hidden="true" />
      <video
        className="welcome-media"
        autoPlay
        muted
        loop
        playsInline
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260619_191346_9d19d66e-86a4-47f7-8dc6-712c1788c3b2.mp4"
        aria-hidden="true"
      />
      <div className="welcome-wash" aria-hidden="true" />
      <WelcomeAbyssCanvas />
      <div className="welcome-content">
        <p className="welcome-eyebrow">Lumora · Cipher Laboratory</p>
        <h1 className="welcome-title">欢迎进入密码实验室</h1>
        <p className="welcome-tagline">在深海噪声之外，<i>守住每一段密钥。</i></p>
        <p className="welcome-hint">点击任意位置进入</p>
        <span className="welcome-progress" aria-hidden="true" />
      </div>
    </div>
  );
}
