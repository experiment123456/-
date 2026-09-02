import { useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Compass,
  Droplets,
  Layers3,
  MousePointer2,
  Play,
  Radio,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";
import JellyfishField from "../components/JellyfishField";

type InnovationTarget = "home" | "workbench";
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

const navItems = ["首页", "功能", "组件", "关于", "联系"] as const;
type NavItem = typeof navItems[number];

const oceanGlassStyle: CSSProperties = {
  backdropFilter: "blur(13px) saturate(155%)",
  WebkitBackdropFilter: "blur(13px) saturate(155%)",
};

const sectionDetails: Record<Exclude<NavItem, "首页">, { label: string; description: string; value: string }> = {
  功能: { label: "LIVING OCEAN SYSTEM", description: "动态焦散、液态阴影与环境粒子共同构成持续呼吸的数字海域。", value: "06 LAYERS" },
  组件: { label: "MODULAR GLASS FIELD", description: "背景、玻璃面板、气泡与水母行为彼此独立，保持流畅与可维护。", value: "04 MODULES" },
  关于: { label: "EXPERIMENTAL SURFACE", description: "把密码实验平台的未来感延伸成更柔和、更明亮的海洋交互概念。", value: "AQUA / 01" },
  联系: { label: "SIGNAL CHANNEL", description: "概念通道已开放，等待下一项功能、内容与交互方向接入。", value: "ONLINE" },
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
  const [activeSection, setActiveSection] = useState<Exclude<NavItem, "首页">>("功能");
  const [immersive, setImmersive] = useState(false);
  const detail = sectionDetails[activeSection];

  const selectSection = (item: NavItem) => {
    if (item === "首页") onNavigate("home");
    else setActiveSection(item);
  };

  return (
    <div className={`innovation-page ${immersive ? "is-immersive" : ""}`}>
      <OceanBackground />
      <JellyfishField />

      <header className="innovation-navbar innovation-glass" style={oceanGlassStyle} data-ripple-block>
        <button className="innovation-brand" type="button" onClick={() => onNavigate("home")} aria-label="返回 Lumora 首页">
          <span className="innovation-brand-mark"><Waves /></span>
          <span><b>Lumora</b><small>OCEAN LAB / 05</small></span>
        </button>

        <nav className="innovation-nav-links" aria-label="待创新页面导航">
          {navItems.map((item) => (
            <button
              type="button"
              key={item}
              className={item === activeSection ? "is-active" : ""}
              onClick={() => selectSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>

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
          <button className="innovation-enter" type="button" onClick={() => onNavigate("workbench")}>进入</button>
          <button className="innovation-start" type="button" onClick={() => setImmersive((value) => !value)}>
            {immersive ? "退出体验" : "开始体验"}<ArrowRight />
          </button>
        </div>
      </header>

      <main className="innovation-stage">
        <section className="innovation-main-panel innovation-glass" style={oceanGlassStyle}>
          <div className="innovation-panel-shine" aria-hidden="true" />
          <div className="innovation-eyebrow"><Sparkles /><span>OCEAN GLASS / CONCEPT 05</span><i /></div>
          <p className="innovation-kicker">Dynamic Ocean Interface Concept</p>
          <h1>待创新页面</h1>
          <p className="innovation-intro">一片拥有光照、流体与生物反馈的数字海域。界面保持安静，细节始终在呼吸。</p>

          <div className="innovation-fields">
            <div className="innovation-field">
              <span><Radio />ACTIVE SIGNAL</span>
              <b>{detail.label}</b>
              <small>{detail.value}</small>
            </div>
            <div className="innovation-field">
              <span><Compass />INTERFACE MODE</span>
              <b>{activeSection} / 流动界面</b>
              <small>REALTIME</small>
            </div>
          </div>

          <div className="innovation-detail" aria-live="polite">
            <span className="innovation-detail-index">0{navItems.indexOf(activeSection) + 1}</span>
            <p>{detail.description}</p>
          </div>

          <div className="innovation-panel-footer">
            <button className="innovation-primary" type="button" onClick={() => setImmersive((value) => !value)}>
              <span>{immersive ? "正在探索" : "开始探索"}</span><ArrowRight />
            </button>
            <div className="innovation-live"><i /><span><b>LIVE OCEAN</b><small>CAUSTICS / PARTICLES / LIFE</small></span></div>
          </div>
        </section>

        <aside className="innovation-data-card innovation-glass" style={oceanGlassStyle} aria-label="海洋数据卡片">
          <div className="innovation-card-top">
            <span><Droplets />OCEAN INTERFACE</span>
            <i>05</i>
          </div>

          <div className="innovation-orb" aria-hidden="true">
            <span className="innovation-orb-core" />
            <span className="innovation-orb-ring ring-one" />
            <span className="innovation-orb-ring ring-two" />
            <CircleDot />
          </div>

          <div className="innovation-card-status">
            <span>DEPTH SIGNAL</span>
            <b>{immersive ? "EXPLORING" : "STABLE"}</b>
          </div>

          <div className="innovation-card-grid">
            <div><span>STATUS</span><b>{immersive ? "ACTIVE" : "READY"}</b></div>
            <div><span>MODE</span><b>EXPERIMENTAL</b></div>
            <div><span>UI FLOW</span><b>05 / AQUA</b></div>
            <div><span>RESPONSE</span><b>16.7 MS</b></div>
          </div>

          <div className="innovation-card-bottom">
            <span><Activity />BIO FIELD ONLINE</span>
            <span><Layers3 />GLASS 04</span>
          </div>
        </aside>
      </main>

      <div className="innovation-jelly-hint innovation-glass" style={oceanGlassStyle} data-ripple-block>
        <MousePointer2 />
        <span><b>JELLYFISH FIELD</b><small>移动鼠标靠近水母，观察它们的逃离反应</small></span>
      </div>

      <button className="innovation-back" type="button" onClick={() => onNavigate("home")} aria-label="返回主界面" data-ripple-block>
        <ArrowLeft /><span>返回主界面</span>
      </button>
    </div>
  );
}
