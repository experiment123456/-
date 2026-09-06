import { useEffect, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Braces, Cpu, Eye, Image, KeyRound, Layers, Network, ShieldCheck, Sparkles } from "lucide-react";
import "./ProjectView.css";
import CipherPendulum from "./CipherPendulum";

const modules = [
  { icon: Braces, title: "单机密码实验", tag: "COMPUTE", text: "从多表代换、自动密钥、Playfair、双重置换与元胞自动机，到 AES-256-GCM、SM2/SM3 和 MD5，亲自设置参数，观察加解密与摘要结果。" },
  { icon: BookOpen, title: "算法过程与档案", tag: "UNDERSTAND", text: "通过原理说明、步骤拆解和过程状态展示，理解算法的参数、执行逻辑与适用场景，让公式与计算结果相互对应。" },
  { icon: KeyRound, title: "DH 密钥交换与攻防", tag: "VERIFY", text: "分步观察公钥交换、共享秘密计算与 SHA-256 密钥派生；模拟 Eve 替换公钥的中间人攻击，再验证数字签名如何识别并阻止替换。" },
  { icon: Network, title: "双机安全通信", tag: "CONNECT", text: "通过 WebSocket 房间连接两台设备，完成 DH 密钥协商、算法选择以及文本和文件的加密传输，观察通信中实际传输的密文。" },
  { icon: Image, title: "图像安全实验", tag: "EXPLORE", text: "探索图像局部加密、AES-256-GCM 保护、LSB 隐写与分析、不可见水印和数字签名溯源，理解图像数据的保护方式。" },
  { icon: Sparkles, title: "AI 智能导师", tag: "ASK", text: "接入通义千问解答密码学问题，结合受控的页面跳转、高亮提示和教学引导，辅助理解原理与完成实验。" },
];
const stacks = [
  ["前端开发", "React 19", "TypeScript", "Vite", "Tailwind CSS", "GSAP", "Lucide React"],
  ["密码与图像", "Web Crypto API", "BigInt", "Canvas API", "jsQR", "自定义密码算法"],
  ["后端与通信", "Node.js", "HTTP API", "WebSocket", "ws"],
  ["AI 与安全", "通义千问 · DashScope", "scrypt", "HttpOnly Cookie", "服务端环境变量"],
  ["测试与工程化", "TypeScript 类型检查", "Vite 构建", "Playwright", "密码与通信回归测试"],
];

export default function ProjectView({ onNavigate }: { onNavigate: (view: "home" | "workbench") => void }) {
  const root = useRef<HTMLDivElement>(null);
  const moduleStage = useRef<HTMLElement>(null);
  const moduleViewport = useRef<HTMLDivElement>(null);
  const moduleTrack = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { root: root.current, threshold: 0.08 });
    root.current?.querySelectorAll(".project-reveal").forEach(element => observer.observe(element));
    const scroller = root.current;
    const syncModuleRail = () => {
      const stage = moduleStage.current;
      const viewport = moduleViewport.current;
      const track = moduleTrack.current;
      if (!scroller || !stage || !viewport || !track) return;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const start = stage.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
      const distance = Math.max(1, stage.offsetHeight - scroller.clientHeight);
      const progress = Math.min(1, Math.max(0, (scroller.scrollTop - start) / distance));
      const travel = Math.max(0, track.scrollWidth - viewport.clientWidth);
      track.style.transform = `translate3d(${-progress * travel}px, 0, 0)`;
      stage.style.setProperty("--rail-progress", `${progress * 100}%`);
      track.dataset.active = String(Math.round(progress * (modules.length - 1)));
    };
    scroller?.addEventListener("scroll", syncModuleRail, { passive: true });
    window.addEventListener("resize", syncModuleRail);
    syncModuleRail();
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", syncModuleRail);
      window.removeEventListener("resize", syncModuleRail);
    };
  }, []);
  return (
    <div className="project-page" ref={root}>
      <div className="project-content">
        <header className="project-hero" aria-label="密码算法点阵展示">
          <CipherPendulum />
          <button className="project-scroll" type="button" aria-label="下滑查看项目介绍" onClick={() => root.current?.querySelector("#project-background")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}><ArrowDown size={23} /></button>
        </header>
        <div className="project-reading">
        <div className="project-reading-media" aria-hidden="true">
          <video
            className="project-reading-video"
            src="/assets/project-intro-bg.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
          <div className="project-reading-shade" />
          <div className="project-reading-particles" />
        </div>
        <svg className="project-engraving" viewBox="0 0 1400 2400" preserveAspectRatio="none" aria-hidden="true">{Array.from({ length: 42 }, (_, i) => <path key={i} d={`M ${-300+i*13} -50 C ${800+i*4} 400, ${-650+i*12} 650, ${140+i*8} 1050 S ${900+i*9} 1650, ${-240+i*13} 2450 M ${1450+i*10} -50 C ${700+i*9} 450, ${1800-i*7} 900, ${1240+i*10} 1350 S ${650+i*10} 2000, ${1500+i*12} 2450`} />)}</svg>
        <section id="project-background" className="project-section project-manifesto project-reveal">
          <p className="project-eyebrow">LUMORA CIPHER / 01 — 项目背景</p>
          <div className="project-why" aria-hidden="true"><span>WHY</span><span>CRYPTO?</span></div>
          <h1 className="project-reading-title">让密码学过程<br /><em>看得见。</em></h1>
          <p className="project-reading-intro">Lumora Cipher 是一个基于 Web 的交互式密码学实验平台。将算法演示、DH 密钥交换与攻防、双机安全通信、图像安全和 AI 智能导师融入统一界面，让抽象原理变得可操作、可观察、可验证。</p>
          <div className="project-manifesto-copy"><p>传统密码学学习常以公式、代码和最终结果为主。密钥如何生成、公钥如何交换、攻击者如何介入，这些关键过程往往难以直观看清。</p><p>我们通过浏览器计算、分步动画和结果对比，将抽象原理转化为可以亲自操作的实验；再通过攻防模拟、双机通信和图像安全场景，连接理论与实际应用。</p></div>
          <div className="project-principles">{[{ icon: Eye, title: "看见算法过程", text: "逐步观察参数与计算，让公式对应真实结果。" }, { icon: ShieldCheck, title: "验证攻击与防御", text: "对比正常、攻击与防护状态，理解安全机制。" }, { icon: Network, title: "完成真实通信", text: "从单机探索走向双机密钥协商与加密传输。" }].map(({ icon: Icon, title, text }, index) => <article key={title}><span>0{index + 1}</span><Icon /><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="project-section project-constellation project-reveal">
          <div className="project-constellation-heading"><p className="project-eyebrow">02 / ARCHITECTURE — 系统架构</p><h2>一个核心，连接四层能力</h2><p>前端呈现过程，密码引擎完成计算，服务端连接设备与智能服务。</p></div>
          <div className="project-star-map">
            <svg viewBox="0 0 1000 620" aria-hidden="true"><path d="M500 310 L210 150 M500 310 L205 475 M500 310 L795 150 M500 310 L800 475" /><circle cx="500" cy="310" r="170" /><circle cx="500" cy="310" r="245" /><g><circle cx="500" cy="310" r="4" /><circle cx="210" cy="150" r="4" /><circle cx="205" cy="475" r="4" /><circle cx="795" cy="150" r="4" /><circle cx="800" cy="475" r="4" /></g></svg>
            <div className="project-core"><span>LUMORA</span><strong>CIPHER</strong><small>COMPUTE · CONNECT · TRUST</small></div>
            <article className="project-star-node node-display"><Layers /><span>01 / BROWSER</span><h3>交互展示层</h3><p>React + TypeScript<br />参数、动画与结果展示</p></article>
            <article className="project-star-node node-crypto"><KeyRound /><span>02 / CRYPTO</span><h3>密码实验层</h3><p>Web Crypto + 自定义算法<br />加解密、DH 与数字签名</p></article>
            <article className="project-star-node node-service"><Network /><span>03 / SERVER</span><h3>通信服务层</h3><p>Node.js + WebSocket<br />认证、接口与房间中继</p></article>
            <article className="project-star-node node-intelligence"><Cpu /><span>04 / DATA & AI</span><h3>数据与智能层</h3><p>本地数据 + DashScope<br />实验状态与智能讲解</p></article>
          </div>
          <p className="project-architecture-note">本地算法实验在浏览器中计算；双机通信通过中继传递数据；AI 对话经服务端调用模型，API 密钥保存在服务端环境变量中。</p>
        </section>

        <section className="project-module-stage" ref={moduleStage}>
          <div className="project-module-sticky"><div className="project-module-header"><p className="project-eyebrow">03 / MODULES — 功能模块</p><h2>六个方向，连接完整学习过程</h2><span>继续下滑</span></div><div className="project-module-viewport" ref={moduleViewport}><div className="project-module-track" ref={moduleTrack}>{modules.map(({ icon: Icon, title, tag, text }, index) => <article className="project-film-card" key={title}><span className="project-film-number">0{index + 1}</span><div className="project-film-visual"><Icon strokeWidth={.8} /><i>{tag}</i></div><div className="project-film-copy"><p>{tag} / LUMORA MODULE</p><h3>{title}</h3><span>{text}</span></div></article>)}</div></div><div className="project-rail"><i /></div></div>
        </section>

        <section className="project-section project-technology project-reveal"><p className="project-eyebrow">04 / TECHNOLOGY — 技术栈</p><h2>支撑每一次交互的技术</h2><p className="project-section-intro">从浏览器界面到密码计算、通信服务与智能讲解，每一层共同组成实验体验。</p><div className="project-tech-lanes">{stacks.map(([title, ...tags], index) => <div className="project-tech-lane" key={title}><strong>{title}</strong><div className={`project-tech-window lane-${index % 2}`}><div className="project-tech-track">{[...tags, ...tags].map((tag, tagIndex) => <span key={`${tag}-${tagIndex}`}>{tag}<i>✦</i></span>)}</div></div></div>)}</div></section>

        <footer className="project-ending project-glass project-reveal"><div className="project-final-sigil" aria-hidden="true"><i /><i /><i /><span>L</span></div><p className="project-eyebrow">THE NEXT STEP IS YOURS</p><h2>在交互中理解密码，<br />在攻防中认识安全。</h2><p>从一个算法开始，观察数据如何被保护；从一次攻击开始，理解身份认证为什么不可缺少。</p><div className="project-actions"><button type="button" onClick={() => onNavigate("home")}><ArrowLeft size={17} />返回首页</button><button className="project-primary" type="button" onClick={() => onNavigate("workbench")}>开始实验<ArrowRight size={18} /></button></div><small>LUMORA CIPHER · INTERACTIVE CRYPTOGRAPHY LABORATORY</small></footer>
        </div>
      </div>
    </div>
  );
}
