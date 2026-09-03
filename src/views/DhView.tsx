import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  LockKeyhole,
  MessageSquareText,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  StepForward,
} from "lucide-react";
import { completeDh, createDhParty, type DhParty } from "../crypto/engine";
import {
  deriveMitmSecrets,
  relayMitmMessage,
  simulateSignatureDefense,
  type MitmMessageResult,
  type MitmSecrets,
  type SignatureDefenseResult,
} from "../crypto/dhDemo";

type DemoMode = "normal" | "mitm" | "protected";

const EMPTY_SECRETS: MitmSecrets = {
  aliceSecret: "",
  eveAliceSecret: "",
  bobSecret: "",
  eveBobSecret: "",
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

function shortened(value: string, visible: boolean) {
  if (!value || visible || value.length < 42) return value;
  return `${value.slice(0, 18)}${"•".repeat(18)}${value.slice(-12)}`;
}

export default function DhView() {
  const [mode, setMode] = useState<DemoMode>("normal");
  const [alice, setAlice] = useState<DhParty>(() => createDhParty());
  const [bob, setBob] = useState<DhParty>(() => createDhParty());
  const [eve, setEve] = useState<DhParty>(() => createDhParty());
  const [aliceSecret, setAliceSecret] = useState("");
  const [bobSecret, setBobSecret] = useState("");
  const [mitmSecrets, setMitmSecrets] = useState<MitmSecrets>(EMPTY_SECRETS);
  const [messageResult, setMessageResult] = useState<MitmMessageResult | null>(null);
  const [signatureReport, setSignatureReport] = useState<SignatureDefenseResult | null>(null);
  const [originalMessage, setOriginalMessage] = useState("转账100元");
  const [modifiedMessage, setModifiedMessage] = useState("转账900元");
  const [events, setEvents] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matched = useMemo(() => Boolean(aliceSecret && aliceSecret === bobSecret), [aliceSecret, bobSecret]);

  const resetOutcomes = () => {
    setAliceSecret("");
    setBobSecret("");
    setMitmSecrets(EMPTY_SECRETS);
    setMessageResult(null);
    setSignatureReport(null);
    setEvents([]);
    setStep(0);
    setError("");
  };

  const regenerate = () => {
    setAlice(createDhParty());
    setBob(createDhParty());
    setEve(createDhParty());
    resetOutcomes();
  };

  const selectMode = (nextMode: DemoMode) => {
    setMode(nextMode);
    resetOutcomes();
  };

  const exchange = async () => {
    setBusy(true);
    setError("");
    try {
      const [left, right] = await Promise.all([
        completeDh(alice.privateKey, bob.publicKey),
        completeDh(bob.privateKey, alice.publicKey),
      ]);
      setAliceSecret(left);
      setBobSecret(right);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "DH交换失败");
    } finally {
      setBusy(false);
    }
  };

  const nextStep = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (step === 0) {
        setStep(1);
        setEvents(["Alice、Bob 与 Eve 已在当前浏览器生成各自的临时DH密钥对。"]);
      } else if (step === 1) {
        setStep(2);
        setEvents((current) => [...current, "Alice 与 Bob 发送公钥，Eve 在传输途中完成截获。"]);
      } else if (step === 2 && mode === "protected") {
        const report = await simulateSignatureDefense(alice, bob, eve);
        setSignatureReport(report);
        setStep(3);
        setEvents((current) => [
          ...current,
          "双方使用预置信任的ECDSA公钥验证DH参数签名。",
          "Eve替换后的DH公钥无法通过签名验证，交换被立即终止。",
        ]);
      } else if (step === 2) {
        const secrets = await deriveMitmSecrets(alice, bob, eve);
        setMitmSecrets(secrets);
        setStep(3);
        setEvents((current) => [
          ...current,
          "Eve用自己的公钥替换双方公钥，分别建立 Alice–Eve 与 Eve–Bob 两组密钥。",
        ]);
      } else if (step === 3 && mode === "mitm") {
        const secrets = mitmSecrets.aliceSecret ? mitmSecrets : await deriveMitmSecrets(alice, bob, eve);
        const result = await relayMitmMessage(originalMessage, modifiedMessage, secrets);
        setMitmSecrets(secrets);
        setMessageResult(result);
        setStep(4);
        setEvents((current) => [...current, `Eve使用 Alice–Eve 密钥解密并读到：“${result.eveRead}”。`]);
      } else if (step === 4 && mode === "mitm") {
        setStep(5);
        setEvents((current) => [
          ...current,
          `Eve将消息改成“${modifiedMessage}”，用 Eve–Bob 密钥重新加密，Bob成功解密。`,
        ]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "演示步骤执行失败");
    } finally {
      setBusy(false);
    }
  };

  const autoDemo = async () => {
    if (busy) return;
    resetOutcomes();
    setBusy(true);
    try {
      setStep(1);
      setEvents(["Alice、Bob 与 Eve 已在当前浏览器生成各自的临时DH密钥对。"]);
      await wait(550);
      setStep(2);
      setEvents((current) => [...current, "Alice 与 Bob 发送公钥，Eve 在传输途中完成截获。"]);
      await wait(650);

      if (mode === "protected") {
        const report = await simulateSignatureDefense(alice, bob, eve);
        setSignatureReport(report);
        setStep(3);
        setEvents((current) => [
          ...current,
          "双方使用预置信任的ECDSA公钥验证DH参数签名。",
          "Eve替换后的DH公钥无法通过签名验证，交换被立即终止。",
        ]);
        return;
      }

      const secrets = await deriveMitmSecrets(alice, bob, eve);
      setMitmSecrets(secrets);
      setStep(3);
      setEvents((current) => [
        ...current,
        "Eve用自己的公钥替换双方公钥，分别建立 Alice–Eve 与 Eve–Bob 两组密钥。",
      ]);
      await wait(700);
      const result = await relayMitmMessage(originalMessage, modifiedMessage, secrets);
      setMessageResult(result);
      setStep(4);
      setEvents((current) => [...current, `Eve使用 Alice–Eve 密钥解密并读到：“${result.eveRead}”。`]);
      await wait(700);
      setStep(5);
      setEvents((current) => [
        ...current,
        `Eve将消息改成“${modifiedMessage}”，用 Eve–Bob 密钥重新加密，Bob成功解密。`,
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "自动演示执行失败");
    } finally {
      setBusy(false);
    }
  };

  const partyCard = (name: string, caption: string, party: DhParty, secret: string, secretLabel = "DERIVED KEY / SHA-256 共享密钥") => (
    <article className="workspace-card dh-party-card rounded-[28px] p-5 sm:p-6" data-agent-id={`dh.${name.toLowerCase()}`}>
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
          <span className="field-caption">{secretLabel}</span>
          <div className={`code-line mt-2 ${secret ? "text-emerald-100" : "text-white/25"}`}>
            {secret ? shortened(secret, reveal) : "等待交换对方公钥…"}
          </div>
        </div>
      </div>
    </article>
  );

  const modeDescription = mode === "normal"
    ? "RFC 3526 MODP 2048 位群 · g = 2。双方只交换公钥，最终独立计算出完全相同的会话密钥。"
    : mode === "mitm"
      ? "在单个浏览器中模拟 Eve 截获并替换DH公钥，观察两组会话密钥如何让攻击者读取并修改消息。"
      : "为临时DH公钥附加 ECDSA P-256 数字签名，在共享密钥生成前识别并阻止公钥替换。";

  const attackFinished = mode === "mitm" && step >= 5 && Boolean(messageResult);
  const defenseBlocked = mode === "protected" && step >= 3 && signatureReport?.attackedValid === false;
  const nextDisabled = busy || (mode === "mitm" ? step >= 5 : step >= 3);

  return (
    <div className="app-panel panel-reveal soft-scroll h-full min-h-0 overflow-y-auto rounded-[30px] p-5 sm:p-7 lg:p-9">
      <header className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div>
          <p className="eyebrow">KEY EXCHANGE / 02</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Diffie–Hellman <span className="italic">Lab</span></h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">{modeDescription}</p>
          <div className="segmented dh-mode-switch mt-5" aria-label="DH实验模式">
            <button data-agent-id="dh.mode.normal" type="button" className={mode === "normal" ? "is-active" : ""} onClick={() => selectMode("normal")}>正常交换</button>
            <button data-agent-id="dh.mode.mitm" type="button" className={mode === "mitm" ? "is-active" : ""} onClick={() => selectMode("mitm")}>中间人攻击</button>
            <button data-agent-id="dh.mode.protected" type="button" className={mode === "protected" ? "is-active" : ""} onClick={() => selectMode("protected")}>签名防护</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" data-agent-id="dh.reveal" type="button" onClick={() => setReveal((value) => !value)}>
            {reveal ? <EyeOff /> : <Eye />} {reveal ? "隐藏完整值" : "显示完整值"}
          </button>
          <button className="secondary-button" data-agent-id="dh.regenerate" type="button" onClick={regenerate}><RefreshCw />重新生成</button>
        </div>
      </header>

      {mode === "normal" ? (
        <>
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
                {matched && <button className="icon-button ml-auto" data-agent-id="dh.copy-secret" type="button" onClick={() => void navigator.clipboard.writeText(aliceSecret)} title="复制共享密钥"><Copy /></button>}
              </div>
            </div>
            <button className="primary-button min-w-52" type="button" onClick={() => void exchange()} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} />{busy ? "正在计算…" : "开始公钥交换"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={`dh-actor-grid mt-7 ${mode === "protected" ? "is-protected" : "is-attacking"}`}>
            {partyCard("Alice", "SENDER / 发送方", alice, mitmSecrets.aliceSecret, "SESSION KEY / Alice ↔ Eve")}
            <article className={`workspace-card dh-party-card dh-eve-card rounded-[28px] p-5 sm:p-6 ${step >= 2 ? "is-intercepting" : ""} ${defenseBlocked ? "is-blocked" : ""}`} data-agent-id="dh.eve">
              <div className="flex items-center justify-between">
                <div><p className="eyebrow">ATTACKER / 中间人</p><h2 className="mt-1 text-3xl italic">Eve</h2></div>
                <span className={`connection-orb ${step >= 2 ? "is-danger" : ""}`} />
              </div>
              <div className="mt-6 space-y-4">
                <div><span className="field-caption">PUBLIC KEY / 用于替换的公钥</span><div className="code-line mt-2">{shortened(eve.publicKey, reveal)}</div></div>
                <div><span className="field-caption">SESSION KEY / Eve ↔ Alice</span><div className={`code-line mt-2 ${mitmSecrets.eveAliceSecret ? "text-orange-100" : "text-white/25"}`}>{mitmSecrets.eveAliceSecret ? shortened(mitmSecrets.eveAliceSecret, reveal) : defenseBlocked ? "签名失败，未建立" : "等待截获Alice公钥…"}</div></div>
                <div><span className="field-caption">SESSION KEY / Eve ↔ Bob</span><div className={`code-line mt-2 ${mitmSecrets.eveBobSecret ? "text-orange-100" : "text-white/25"}`}>{mitmSecrets.eveBobSecret ? shortened(mitmSecrets.eveBobSecret, reveal) : defenseBlocked ? "签名失败，未建立" : "等待截获Bob公钥…"}</div></div>
              </div>
            </article>
            {partyCard("Bob", "RECEIVER / 接收方", bob, mitmSecrets.bobSecret, "SESSION KEY / Eve ↔ Bob")}
          </div>

          <div className="dh-flow-line mt-4" data-agent-id="dh.flow" aria-label="公钥传递路径"><span>Alice公钥</span><ArrowRight /><strong>{step >= 2 ? "Eve截获并替换" : "等待传输"}</strong><ArrowRight /><span>Bob</span></div>

          {mode === "protected" && (
            <section className={`dh-signature-panel mt-4 rounded-[24px] p-5 ${defenseBlocked ? "is-blocked" : ""}`} data-agent-id="dh.signature">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="verification-icon">{defenseBlocked ? <CircleX /> : <LockKeyhole />}</div>
                  <div><p className="text-lg">{defenseBlocked ? "签名验证失败，攻击已阻止" : "ECDSA身份认证等待执行"}</p><p className="mt-1 text-sm leading-6 text-white/45">{defenseBlocked ? "Eve无法为替换后的DH公钥生成Alice或Bob的合法签名，因此交换在派生会话密钥前终止。" : "签名内容绑定会话编号、角色和DH公钥；双方签名公钥视为已通过可信渠道预置。"}</p></div>
                </div>
                <span className={`dh-verdict-chip ${defenseBlocked ? "is-danger" : ""}`}>{defenseBlocked ? "BLOCKED" : "ECDSA P-256 / SHA-256"}</span>
              </div>
              {signatureReport && <div className="dh-fingerprint-grid mt-4"><div><span className="field-caption">ALICE SIGNING KEY / 指纹</span><div className="code-line mt-2">{shortened(signatureReport.aliceFingerprint, reveal)}</div></div><div><span className="field-caption">BOB SIGNING KEY / 指纹</span><div className="code-line mt-2">{shortened(signatureReport.bobFingerprint, reveal)}</div></div></div>}
            </section>
          )}

          <section className="workspace-card dh-demo-console mt-4 rounded-[26px] p-5 sm:p-6" data-agent-id="dh.demo">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div><p className="eyebrow">INTERACTIVE TRACE / 交互演示</p><h2 className="mt-1 text-2xl italic">{mode === "mitm" ? "Message interception" : "Authenticated exchange"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{mode === "mitm" ? "使用真实DH派生密钥与AES-GCM完成截获、解密、修改和转发。" : "使用真实ECDSA签名验证被替换的DH公开参数。"}</p></div>
              <div className="flex flex-wrap gap-2"><button className="secondary-button" data-agent-id="dh.demo.next" type="button" disabled={nextDisabled} onClick={() => void nextStep()}><StepForward />下一步</button><button className="primary-button" data-agent-id="dh.demo.auto" type="button" disabled={busy} onClick={() => void autoDemo()}><Play />{busy ? "演示进行中…" : "一键演示"}</button></div>
            </div>

            {mode === "mitm" && <div className="dh-message-editor mt-5"><label className="field-label"><span>ALICE MESSAGE / 原始消息</span><textarea className="field-control" data-agent-id="dh.message.original" rows={2} value={originalMessage} onChange={(event) => setOriginalMessage(event.target.value)} disabled={busy} /></label><label className="field-label"><span>EVE MODIFICATION / 篡改内容</span><textarea className="field-control" data-agent-id="dh.message.modified" rows={2} value={modifiedMessage} onChange={(event) => setModifiedMessage(event.target.value)} disabled={busy} /></label></div>}

            <div className="dh-trace-grid mt-5">
              <div className="dh-event-log"><div className="flex items-center gap-2 text-sm text-white/65"><MessageSquareText className="h-4 w-4" />过程日志</div><ol className="mt-3 space-y-2" aria-live="polite">{events.length ? events.map((event, index) => <li key={`${index}-${event}`}><span>{index + 1}</span><p>{event}</p></li>) : <li className="is-empty"><span>0</span><p>点击“下一步”逐步观察，或使用“一键演示”。</p></li>}</ol></div>
              <div className="dh-message-trace">
                {mode === "mitm" ? <><div><span>ALICE → EVE / AES-GCM密文</span><code>{step >= 4 && messageResult ? shortened(messageResult.aliceCiphertext, reveal) : "等待Alice发送加密消息…"}</code></div><div className={step >= 4 ? "is-exposed" : ""}><span>EVE DECRYPTED / 截获明文</span><code>{step >= 4 && messageResult ? messageResult.eveRead : "等待Eve解密…"}</code></div><div className={step >= 5 ? "is-exposed" : ""}><span>BOB RECEIVED / 最终收到</span><code>{step >= 5 && messageResult ? messageResult.bobRead : "等待Eve重新加密并转发…"}</code></div></> : <><div><span>GENUINE SIGNATURES / 原始参数</span><code>{signatureReport ? (signatureReport.genuineValid ? "验证通过" : "验证异常") : "等待双方签署DH公钥…"}</code></div><div className={defenseBlocked ? "is-blocked" : ""}><span>SUBSTITUTED KEYS / 替换后参数</span><code>{defenseBlocked ? "验证失败 · 拒绝交换" : "等待Eve尝试替换…"}</code></div><div><span>SESSION ID / 防重放绑定</span><code>{signatureReport?.sessionId || "等待生成会话编号…"}</code></div></>}
              </div>
            </div>
          </section>

          <div className={`verification-card dh-result-card mt-4 rounded-[24px] p-5 ${attackFinished ? "is-attacked" : ""} ${defenseBlocked ? "is-verified" : ""}`} data-agent-id="dh.result" data-agent-state={attackFinished ? "attack-complete" : defenseBlocked ? "defense-complete" : "idle"}><div className="flex items-start gap-4"><div className="verification-icon">{attackFinished ? <ShieldAlert /> : defenseBlocked ? <ShieldCheck /> : <AlertTriangle />}</div><div><p className="text-lg">{attackFinished ? "中间人攻击成功" : defenseBlocked ? "数字签名成功阻止攻击" : "等待开始安全实验"}</p><p className="mt-1 text-sm leading-6 text-white/45">{attackFinished ? "Alice和Bob都能正常通信，但实际分别与Eve共享不同密钥，双方不会仅凭DH发现攻击。" : defenseBlocked ? "被替换的DH公钥无法通过可信签名公钥验证，系统没有生成任何受攻击的会话密钥。" : "整个实验只在当前浏览器内模拟三个角色，不连接房间或真实设备。"}</p></div></div></div>
        </>
      )}

      {error && <div className="status-note is-error mt-4"><AlertTriangle /><span>{error}</span></div>}
    </div>
  );
}
