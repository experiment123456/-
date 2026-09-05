import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Image as ImageIcon, Play, ShieldCheck, Sparkles, Volume2, VolumeX, Waves } from "lucide-react";
import JellyfishField from "../components/JellyfishField";
import ReefBackground from "../components/ReefBackground";
import "./InnovationView.css";

type InnovationTarget = "home" | "ocean" | "agent";
type InnovationViewProps = {
  onNavigate: (target: InnovationTarget) => void;
  musicPlaying: boolean;
  musicNeedsAction: boolean;
  onToggleMusic: () => void;
};

export default function InnovationView({ onNavigate, musicPlaying, musicNeedsAction, onToggleMusic }: InnovationViewProps) {
  const [entering, setEntering] = useState<InnovationTarget | null>(null);
  const entryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (entryTimer.current !== null) clearTimeout(entryTimer.current);
  }, []);

  const enter = (target: InnovationTarget) => {
    if (entryTimer.current !== null) return;
    setEntering(target);
    // Leave a brief moment for the click colour to register before navigation.
    entryTimer.current = setTimeout(() => onNavigate(target), 240);
  };

  return (
    <div className="reef-page">
      <ReefBackground />
      <JellyfishField />
      <div className="reef-content">
        <header className="reef-header" data-ripple-block>
          <button className="reef-brand" type="button" onClick={() => onNavigate("home")} aria-label="返回 Lumora 首页">
            <Waves aria-hidden="true" />
            <span><b>Lumora</b><small>返回主界面 / HOME</small></span>
          </button>
          <div className="reef-location"><Sparkles aria-hidden="true" /><span>智能创新中心</span></div>
          <button className={`reef-music ${musicPlaying ? "is-playing" : ""}`} type="button" onClick={onToggleMusic}
            aria-label={musicPlaying ? "暂停舒缓背景音乐" : "播放舒缓背景音乐"}
            title={musicNeedsAction ? "点击开启舒缓音乐" : musicPlaying ? "暂停舒缓音乐" : "播放舒缓音乐"}>
            {musicPlaying ? <Volume2 /> : musicNeedsAction ? <Play /> : <VolumeX />}
          </button>
        </header>
        <main className="reef-main">
          <div className="reef-hero">
            <p className="reef-eyebrow">AI 智能导师 · 沉浸式密码学学习伙伴</p>
            <h1><span>让好奇心，潜入深海</span><span>让每一次探索，都有回响</span></h1>
            <p className="reef-intro">与 AI 智能导师同行，探索密码学的无限可能。<br />从一个问题出发，让未知慢慢清晰。</p>
            <div className={`reef-actions${entering ? " is-entering" : ""}`} data-ripple-block>
              <div className="reef-action-group">
                <button className={`reef-action reef-action-primary${entering === "agent" ? " is-entering" : ""}`} type="button"
                  onClick={() => enter("agent")} aria-describedby="reef-agent-preview" aria-busy={entering === "agent"}>
                  <span>进入 AI 导师</span><ArrowRight aria-hidden="true" />
                </button>
                <div className="reef-action-preview" id="reef-agent-preview" role="tooltip">
                  <Bot aria-hidden="true" />
                  <div><strong>与 AI 导师一起探索</strong><p>从深海旅程开启对话，解答疑问、学习密码学。</p></div>
                  <span className="reef-preview-tag">智能问答</span>
                </div>
              </div>
              <div className="reef-action-group">
                <button className={`reef-action reef-action-secondary${entering === "ocean" ? " is-entering" : ""}`} type="button"
                  onClick={() => enter("ocean")} aria-describedby="reef-image-preview" aria-busy={entering === "ocean"}>
                  <span>进入图片实验</span><ArrowRight aria-hidden="true" />
                </button>
                <div className="reef-action-preview reef-action-preview-image" id="reef-image-preview" role="tooltip">
                  <ImageIcon aria-hidden="true" />
                  <div><strong>发现图像里的秘密</strong><p>探索数字水印、信息隐写与图像安全实验。</p></div>
                  <span className="reef-preview-tag">图像安全</span>
                </div>
              </div>
            </div>
            <p className="reef-entry-note">跟随深海介绍向下探索，在旅程末端开启对话</p>
          </div>
        </main>
        <footer className="reef-footer">
          <div className="reef-features" aria-label="探索内容">
            <div><Bot aria-hidden="true" /><span>智能问答<small>AI MENTOR</small></span></div>
            <div><ShieldCheck aria-hidden="true" /><span>密码学探索<small>CRYPTOGRAPHY</small></span></div>
            <div><ImageIcon aria-hidden="true" /><span>图像安全<small>IMAGE SECURITY</small></span></div>
            <div><Waves aria-hidden="true" /><span>沉浸式学习<small>IMMERSIVE LEARNING</small></span></div>
          </div>
          <p className="reef-jelly-hint">移动鼠标靠近水母，观察它们的逃离反应</p>
        </footer>
      </div>
    </div>
  );
}
