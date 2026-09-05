import { useState } from "react";
import { ArrowRight, Bot, Image as ImageIcon, Play, ShieldCheck, Sparkles, Volume2, VolumeX, Waves } from "lucide-react";
import JellyfishField from "../components/JellyfishField";
import ReefBackground from "../components/ReefBackground";
import ImageLabPreviewDialog from "../components/ImageLabPreviewDialog";
import "./InnovationView.css";

type InnovationTarget = "home" | "ocean" | "agent";
type InnovationViewProps = {
  onNavigate: (target: InnovationTarget) => void;
  musicPlaying: boolean;
  musicNeedsAction: boolean;
  onToggleMusic: () => void;
};

export default function InnovationView({ onNavigate, musicPlaying, musicNeedsAction, onToggleMusic }: InnovationViewProps) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

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
            <div className="reef-actions">
              <button className="reef-action reef-action-primary" type="button" onClick={() => onNavigate("agent")}>
                <span>进入 AI 导师</span><ArrowRight aria-hidden="true" />
              </button>
              <button
                className="reef-action reef-action-secondary"
                type="button"
                onClick={() => setImagePreviewOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={imagePreviewOpen}
              >
                <span>进入图片实验</span><ArrowRight aria-hidden="true" />
              </button>
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
      <ImageLabPreviewDialog
        open={imagePreviewOpen}
        onClose={() => setImagePreviewOpen(false)}
        onEnter={() => {
          setImagePreviewOpen(false);
          onNavigate("ocean");
        }}
      />
    </div>
  );
}
