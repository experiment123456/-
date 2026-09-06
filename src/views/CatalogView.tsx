import { ArrowRight, Bot, Braces, Image, KeyRound, Network, ShieldCheck, Sparkles } from "lucide-react";
import { algorithms, type AlgorithmId } from "../crypto/engine";

type ProjectTarget = "workbench" | "dh" | "network" | "image-lab" | "agent";

const modules: Array<{
  view: ProjectTarget;
  title: string;
  label: string;
  description: string;
  icon: typeof Braces;
  accent: string;
}> = [
  { view: "workbench", title: "单机密码实验", label: "LOCAL CIPHER LAB", description: "体验古典密码、AES、SM2 与摘要算法，并查看完整演算步骤。", icon: Braces, accent: "mint" },
  { view: "dh", title: "DH 密钥交换", label: "KEY EXCHANGE", description: "逐步演示共享密钥生成、中间人攻击与签名防护。", icon: KeyRound, accent: "blue" },
  { view: "network", title: "双机安全通信", label: "SECURE CHANNEL", description: "通过 WebSocket 完成算法协商、加密消息与文件传输。", icon: Network, accent: "peach" },
  { view: "image-lab", title: "图像安全实验", label: "IMAGE SECURITY", description: "进行区域保护、隐写、水印验证与安全策略编排。", icon: Image, accent: "violet" },
  { view: "agent", title: "Lumora Agent", label: "AI ASSISTANT", description: "向智能导师提问，或让它带你完成站内密码学实验。", icon: Bot, accent: "mint" },
];

export default function CatalogView({ onOpen }: { onOpen: (view: ProjectTarget) => void }) {
  const openAlgorithm = (algorithm: AlgorithmId) => {
    try { sessionStorage.setItem("lumora-workbench-algorithm", algorithm); } catch { /* 单机实验页仍可正常打开 */ }
    onOpen("workbench");
  };

  return (
    <div className="app-panel panel-reveal soft-scroll h-full min-h-0 overflow-y-auto rounded-[30px] p-5 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">PROJECT NAVIGATION / 01</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">项目 <span className="italic">导航</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">从这里快速进入 Lumora 的密码实验、安全通信、图像实验与 AI 助手。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => onOpen("workbench")}>开始实验 <ArrowRight /></button>
      </header>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-agent-id="catalog.grid">
        {modules.map((item, index) => {
          const Icon = item.icon;
          return (
          <button className={`catalog-card accent-${item.accent} group rounded-[26px] p-5 text-left`} key={item.view} type="button" onClick={() => onOpen(item.view)}>
            <div className="flex items-start justify-between"><span className="catalog-index">0{index + 1}</span><ArrowRight className="h-4 w-4 opacity-35 transition group-hover:translate-x-1 group-hover:opacity-100" /></div>
            <Icon className="mt-7 h-5 w-5 text-white/55" />
            <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-white/45">{item.label}</p>
            <h2 className="mt-2 text-xl">{item.title}</h2>
            <p className="mt-3 text-xs leading-5 text-white/45">{item.description}</p>
          </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="feature-strip"><ShieldCheck /><span><b>浏览器本地运算</b><small>实验明文与密钥不写入账户档案</small></span></div>
        <div className="feature-strip"><Network /><span><b>双端协作</b><small>DH 协商与 WebSocket 实时通道</small></span></div>
        <div className="feature-strip"><Sparkles /><span><b>智能教学</b><small>Agent 导航、讲解与白名单操作</small></span></div>
      </div>

      <section className="mt-9 border-t border-white/10 pt-7" aria-labelledby="algorithm-quick-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">ALGORITHM QUICK ACCESS</p>
            <h2 id="algorithm-quick-title" className="mt-2 text-2xl sm:text-3xl">算法快速入口</h2>
          </div>
          <p className="text-xs text-white/40">选择后直接进入单机实验台对应算法</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-agent-id="catalog.algorithms">
          {algorithms.map((item, index) => (
            <button
              className={`catalog-card accent-${["mint", "blue", "peach", "violet"][index % 4]} group rounded-[24px] p-5 text-left`}
              key={item.id}
              type="button"
              onClick={() => openAlgorithm(item.id)}
            >
              <div className="flex items-start justify-between"><span className="catalog-index">{String(index + 1).padStart(2, "0")}</span><ArrowRight className="h-4 w-4 opacity-35 transition group-hover:translate-x-1 group-hover:opacity-100" /></div>
              <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-white/45">{item.family}</p>
              <h3 className="mt-2 text-xl">{item.name}</h3>
              <p className="mt-3 text-xs leading-5 text-white/45">{item.summary}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
