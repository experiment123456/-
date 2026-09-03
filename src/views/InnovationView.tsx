import { type CSSProperties } from "react";
import {
  ArrowRight,
  Bot,
  CircleDot,
  Image as ImageIcon,
  MousePointer2,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import JellyfishField from "../components/JellyfishField";

type InnovationTarget = "home" | "ocean" | "agent";
type InnovationViewProps = {
  onNavigate: (target: InnovationTarget) => void;
  musicPlaying: boolean;
  musicNeedsAction: boolean;
  onToggleMusic: () => void;
};
type BubbleStyle = CSSProperties & {
  "--bubble-size": string;
  "--bubble-left": string;
  "--bubble-drift": string;
  "--bubble-duration": string;
  "--bubble-delay": string;
  "--bubble-opacity": string;
};

const oceanGlassStyle: CSSProperties = {
  backdropFilter: "blur(13px) saturate(155%)",
  WebkitBackdropFilter: "blur(13px) saturate(155%)",
};

const bubbles = Array.from({ length: 24 }, (_, index) => ({
  size: 3 + ((index * 7) % 12),
  left: (index * 37 + 11) % 97,
  drift: ((index * 29) % 90) - 45,
  duration: 11 + ((index * 5) % 15),
  delay: -((index * 3.7) % 22),
  opacity: 0.16 + ((index * 13) % 32) / 100,
}));

function CellularCaustics({ variant }: { variant: "primary" | "secondary" }) {
  const patternId = `innovation-cell-pattern-${variant}`;
  const filterId = `innovation-cell-distort-${variant}`;
  const primary = variant === "primary";

  return (
    <svg
      className={`innovation-caustics innovation-cellular-caustics cells-${variant}`}
      viewBox="0 0 1440 960"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <defs>
        <pattern
          id={patternId}
          width={primary ? "242" : "188"}
          height={primary ? "182" : "142"}
          patternUnits="userSpaceOnUse"
          patternTransform={primary ? "rotate(-4)" : "rotate(8)"}
        >
          <g className="innovation-cell-shadow" fill="none">
            <path d="M0-7C31 11 18 51 7 83S17 145 0 189" />
            <path d="M78-8C53 20 66 50 87 77s18 62-9 111" />
            <path d="M160-8c22 27 11 57-7 84s-16 68 9 114" />
            <path d="M242-7c-29 22-19 56-5 84s12 71 5 112" />
            <path d="M-8 0c31 25 73 9 104 2s70-4 101 6 52 2 60-8" />
            <path d="M-9 61c37-23 70-7 102 8s70 13 103-5 51-17 62-3" />
            <path d="M-8 122c29 20 63 17 97 2s77-17 108 4 49 18 62-5" />
            <path d="M-9 182c34-18 70-11 105 0s70 15 104-3 50-12 60 3" />
          </g>
          <g className="innovation-cell-highlight" fill="none">
            <path d="M0-7C31 11 18 51 7 83S17 145 0 189" />
            <path d="M78-8C53 20 66 50 87 77s18 62-9 111" />
            <path d="M160-8c22 27 11 57-7 84s-16 68 9 114" />
            <path d="M242-7c-29 22-19 56-5 84s12 71 5 112" />
            <path d="M-8 0c31 25 73 9 104 2s70-4 101 6 52 2 60-8" />
            <path d="M-9 61c37-23 70-7 102 8s70 13 103-5 51-17 62-3" />
            <path d="M-8 122c29 20 63 17 97 2s77-17 108 4 49 18 62-5" />
            <path d="M-9 182c34-18 70-11 105 0s70 15 104-3 50-12 60 3" />
          </g>
        </pattern>
        <filter id={filterId} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={primary ? "0.006 0.012" : "0.009 0.017"}
            numOctaves="2"
            seed={primary ? "17" : "31"}
            result="waterNoise"
          >
            <animate
              attributeName="baseFrequency"
              dur={primary ? "19s" : "25s"}
              values={primary ? "0.006 0.012;0.009 0.009;0.006 0.012" : "0.009 0.017;0.012 0.013;0.009 0.017"}
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="waterNoise"
            scale={primary ? "36" : "24"}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>
      <rect x="-12%" y="-12%" width="124%" height="124%" fill={`url(#${patternId})`} filter={`url(#${filterId})`} />
    </svg>
  );
}

function OceanBackground() {
  return (
    <div className="innovation-ocean" aria-hidden="true">
      <div className="innovation-surface-light" />
      <CellularCaustics variant="primary" />
      <CellularCaustics variant="secondary" />
      <div className="innovation-shadow-current" />
      <div className="innovation-microdust" />
      <div className="innovation-bubbles">
        {bubbles.map((bubble, index) => {
          const style: BubbleStyle = {
            "--bubble-size": `${bubble.size}px`,
            "--bubble-left": `${bubble.left}%`,
            "--bubble-drift": `${bubble.drift}px`,
            "--bubble-duration": `${bubble.duration}s`,
            "--bubble-delay": `${bubble.delay}s`,
            "--bubble-opacity": String(bubble.opacity),
          };
          return <span className="innovation-bubble" style={style} key={index} />;
        })}
      </div>
    </div>
  );
}

export default function InnovationView({ onNavigate, musicPlaying, musicNeedsAction, onToggleMusic }: InnovationViewProps) {
  return (
    <div className="innovation-page">
      <OceanBackground />
      <JellyfishField />

      <header className="innovation-navbar innovation-glass" style={oceanGlassStyle} data-ripple-block>
        <button className="innovation-brand" type="button" onClick={() => onNavigate("home")} aria-label="返回 Lumora 首页">
          <span className="innovation-brand-mark"><Waves /></span>
          <span><b>Lumora</b><small>返回主界面 / HOME</small></span>
        </button>

        <div className="innovation-nav-summary" aria-label="当前页面">
          <Sparkles />
          <span><b>智能创新中心</b><small>AI INNOVATION</small></span>
        </div>

        <div className="innovation-nav-actions">
          <button
            className={`innovation-music-button home-music-toggle ${musicPlaying ? "is-playing" : ""} ${musicNeedsAction ? "needs-action" : ""}`}
            type="button"
            onClick={onToggleMusic}
            aria-label={musicPlaying ? "暂停舒缓背景音乐" : "播放舒缓背景音乐"}
            title={musicNeedsAction ? "点击开启舒缓音乐" : musicPlaying ? "暂停舒缓音乐" : "播放舒缓音乐"}
            data-ripple-block
          >
            {musicPlaying ? <Volume2 /> : musicNeedsAction ? <Play /> : <VolumeX />}
          </button>
        </div>
      </header>

      <main className="innovation-stage">
        <section className="innovation-main-panel innovation-glass" style={oceanGlassStyle}>
          <div className="innovation-panel-shine" aria-hidden="true" />
          <div className="innovation-eyebrow"><Bot /><span>智能导师 / 导航 01</span><i /></div>
          <p className="innovation-kicker">沉浸式密码学学习伙伴</p>
          <h1>AI 智能导师</h1>
          <p className="innovation-intro">先进入深海智能体的沉浸式介绍，跟随页面向下探索；抵达末端后，再进入黄色对话框向千问提问。</p>

          <div className="innovation-fields">
            <div className="innovation-field">
              <span><Bot />导师能力</span>
              <b>密码学问答与引导</b>
              <small>QWEN</small>
            </div>
            <div className="innovation-field">
              <span><ShieldCheck />进入方式</span>
              <b>先浏览介绍，再开启对话</b>
              <small>SCROLL</small>
            </div>
          </div>

          <div className="innovation-detail">
            <span className="innovation-detail-index">01</span>
            <p>保留完整的下滑过程与动态特效，黄色对话入口只在体验末端出现。</p>
          </div>

          <div className="innovation-panel-footer">
            <button className="innovation-primary" type="button" onClick={() => onNavigate("agent")}>
              <span>进入 AI 导师</span><ArrowRight />
            </button>
            <div className="innovation-live"><i /><span><b>导师已就绪</b><small>介绍 / 探索 / 对话</small></span></div>
          </div>
        </section>

        <aside className="innovation-data-card innovation-glass" style={oceanGlassStyle} aria-label="图片实验入口">
          <div className="innovation-card-top">
            <span><ImageIcon />图片实验 / 导航 02</span>
            <i>02</i>
          </div>

          <div className="innovation-orb" aria-hidden="true">
            <span className="innovation-orb-core" />
            <span className="innovation-orb-ring ring-one" />
            <span className="innovation-orb-ring ring-two" />
            <CircleDot />
          </div>

          <div className="innovation-card-status">
            <span>图像安全实验室</span>
            <b>已就绪</b>
          </div>

          <div className="innovation-card-grid">
            <div><span>实验类型</span><b>图片安全</b></div>
            <div><span>处理方式</span><b>浏览器本地</b></div>
            <div><span>学习模式</span><b>可视化操作</b></div>
            <div><span>状态</span><b>可立即体验</b></div>
          </div>

          <p className="innovation-image-copy">进入图片实验，体验面向图像内容的密码学与隐私保护工具。</p>
          <button className="innovation-image-action" type="button" onClick={() => onNavigate("ocean")}>
            <span>进入图片实验</span><ArrowRight />
          </button>
        </aside>
      </main>

      <div className="innovation-jelly-hint innovation-glass" style={oceanGlassStyle} data-ripple-block>
        <MousePointer2 />
        <span><b>水母场</b><small>移动鼠标靠近水母，观察它们的逃离反应</small></span>
      </div>

    </div>
  );
}
