import { ArrowRight, Blocks, Fingerprint, KeyRound, Network, Shield, Waves } from "lucide-react";
import { algorithms } from "../crypto/engine";

const accents = ["mint", "blue", "peach", "violet"];

export default function CatalogView({ onOpen }: { onOpen: (view: "workbench" | "dh" | "network") => void }) {
  return (
    <div className="app-panel panel-reveal soft-scroll h-full min-h-0 overflow-y-auto rounded-[30px] p-5 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">CRYPTOGRAPHY INDEX / 04</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">算法 <span className="italic">档案</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">七类密码、一个摘要算法，加上完整 DH 密钥交换与 Socket 传输链路。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => onOpen("workbench")}>进入单机实验台 <ArrowRight /></button>
      </header>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-agent-id="catalog.grid">
        {algorithms.map((item, index) => (
          <button className={`catalog-card accent-${accents[index % accents.length]} group rounded-[26px] p-5 text-left`} key={item.id} type="button" onClick={() => onOpen("workbench")}>
            <div className="flex items-start justify-between"><span className="catalog-index">0{index + 1}</span><ArrowRight className="h-4 w-4 opacity-35 transition group-hover:translate-x-1 group-hover:opacity-100" /></div>
            <p className="mt-7 text-xs uppercase tracking-[0.16em] text-white/45">{item.family}</p>
            <h2 className="mt-2 text-2xl">{item.name}</h2>
            <p className="mt-3 text-xs leading-5 text-white/45">{item.summary}</p>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <button className="feature-strip" type="button" onClick={() => onOpen("dh")}><KeyRound /><span><b>DH 2048</b><small>会话密钥交换</small></span><ArrowRight /></button>
        <button className="feature-strip" type="button" onClick={() => onOpen("network")}><Network /><span><b>WebSocket</b><small>双机实时通道</small></span><ArrowRight /></button>
        <div className="feature-strip"><Fingerprint /><span><b>MD5 Verify</b><small>消息与文件完整性</small></span><Shield /></div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11px] text-white/30"><Blocks className="h-3.5 w-3.5" />浏览器 Web Crypto + 独立算法实现 <Waves className="ml-auto h-3.5 w-3.5" />动态界面不影响密码运算</div>
    </div>
  );
}
