import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import { completeDh, createDhParty, type DhParty } from "../crypto/engine";

function shortened(value: string, visible: boolean) {
  if (visible) return value;
  return `${value.slice(0, 18)}${"•".repeat(18)}${value.slice(-12)}`;
}

export default function DhView() {
  const [alice, setAlice] = useState<DhParty>(() => createDhParty());
  const [bob, setBob] = useState<DhParty>(() => createDhParty());
  const [aliceSecret, setAliceSecret] = useState("");
  const [bobSecret, setBobSecret] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const matched = useMemo(() => Boolean(aliceSecret && aliceSecret === bobSecret), [aliceSecret, bobSecret]);

  const regenerate = () => {
    setAlice(createDhParty());
    setBob(createDhParty());
    setAliceSecret("");
    setBobSecret("");
  };

  const exchange = async () => {
    setBusy(true);
    const [left, right] = await Promise.all([
      completeDh(alice.privateKey, bob.publicKey),
      completeDh(bob.privateKey, alice.publicKey),
    ]);
    setAliceSecret(left);
    setBobSecret(right);
    setBusy(false);
  };

  const partyCard = (name: string, caption: string, party: DhParty, secret: string) => (
    <article className="workspace-card rounded-[28px] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">{caption}</p>
          <h2 className="mt-1 text-3xl italic">{name}</h2>
        </div>
        <span className={`connection-orb ${secret ? "is-online" : ""}`} />
      </div>
      <div className="mt-6 space-y-4">
        <div>
          <span className="field-caption">PRIVATE KEY / 私钥（不传输）</span>
          <div className="code-line mt-2">{shortened(party.privateKey, reveal)}</div>
        </div>
        <div>
          <span className="field-caption">PUBLIC KEY / 公钥</span>
          <div className="code-line mt-2">{shortened(party.publicKey, reveal)}</div>
        </div>
        <div>
          <span className="field-caption">DERIVED KEY / SHA-256 共享密钥</span>
          <div className={`code-line mt-2 ${secret ? "text-emerald-100" : "text-white/25"}`}>
            {secret || "等待交换对方公钥…"}
          </div>
        </div>
      </div>
    </article>
  );

  return (
    <div className="app-panel panel-reveal soft-scroll h-full min-h-0 overflow-y-auto rounded-[30px] p-5 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">KEY EXCHANGE / 02</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Diffie–Hellman <span className="italic">Lab</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
            RFC 3526 MODP 2048 位群 · g = 2。双方只交换公钥，最终独立计算出完全相同的会话密钥。
          </p>
        </div>
        <div className="flex gap-2">
          <button className="secondary-button" type="button" onClick={() => setReveal((value) => !value)}>
            {reveal ? <EyeOff /> : <Eye />} {reveal ? "隐藏完整值" : "显示完整值"}
          </button>
          <button className="secondary-button" type="button" onClick={regenerate}><RefreshCw />重新生成</button>
        </div>
      </header>

      <div className="relative mt-7 grid gap-4 lg:grid-cols-2">
        {partyCard("Alice", "ENCRYPTOR / 加密端", alice, aliceSecret)}
        <div className={`exchange-pulse ${matched ? "is-complete" : ""}`} aria-hidden="true"><span /></div>
        {partyCard("Bob", "DECRYPTOR / 解密端", bob, bobSecret)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className={`verification-card rounded-[24px] p-5 ${matched ? "is-verified" : ""}`}>
          <div className="flex items-start gap-4">
            <div className="verification-icon">{matched ? <Check /> : <ShieldCheck />}</div>
            <div>
              <p className="text-lg">{matched ? "交换成功，两端密钥一致" : "准备交换公开参数"}</p>
              <p className="mt-1 text-sm leading-6 text-white/45">
                {matched ? `会话指纹：${aliceSecret.slice(0, 12).toUpperCase()} · ${aliceSecret.slice(-12).toUpperCase()}` : "点击右侧按钮模拟两台设备的完整 DH 交换与 SHA-256 派生。"}
              </p>
            </div>
            {matched && <button className="icon-button ml-auto" type="button" onClick={() => void navigator.clipboard.writeText(aliceSecret)} title="复制共享密钥"><Copy /></button>}
          </div>
        </div>
        <button className="primary-button min-w-52" type="button" onClick={() => void exchange()} disabled={busy}>
          <RefreshCw className={busy ? "animate-spin" : ""} />{busy ? "正在计算…" : "开始公钥交换"}
        </button>
      </div>
    </div>
  );
}

