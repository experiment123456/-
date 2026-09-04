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

const DH_P = BigInt(
  "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF",
);

const NORMAL_STEPS = [
  "公共参数",
  "生成私钥",
  "计算公钥",
  "交换公钥",
  "计算共享秘密",
  "SHA-256 派生",
  "结果校验",
];

const SMALL_EXAMPLE = {
  p: 23,
  g: 5,
  alicePrivate: 6,
  bobPrivate: 15,
  alicePublic: 8,
  bobPublic: 19,
  shared: 2,
};

function modPowForTrace(base: bigint, exponent: bigint, modulus: bigint) {
  let result = 1n;
  let value = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}

function rawDhSecret(privateKeyHex: string, peerPublicHex: string) {
  const privateKey = BigInt(`0x${privateKeyHex}`);
  const peerPublic = BigInt(`0x${peerPublicHex}`);
  return modPowForTrace(peerPublic, privateKey, DH_P).toString(16).padStart(512, "0");
}

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
  const [normalStep, setNormalStep] = useState(0);
  const [normalEvents, setNormalEvents] = useState<string[]>([]);
  const [aliceRawSecret, setAliceRawSecret] = useState("");
  const [bobRawSecret, setBobRawSecret] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matched = useMemo(
    () => normalStep >= 7 && Boolean(aliceSecret && aliceSecret === bobSecret),
    [aliceSecret, bobSecret, normalStep],
  );

  const resetOutcomes = () => {
    setAliceSecret("");
    setBobSecret("");
    setMitmSecrets(EMPTY_SECRETS);
    setMessageResult(null);
    setSignatureReport(null);
    setEvents([]);
    setStep(0);
    setNormalStep(0);
    setNormalEvents([]);
    setAliceRawSecret("");
    setBobRawSecret("");
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

  const runNormalStep = async () => {
    if (busy || normalStep >= 7) return;
    setBusy(true);
    setError("");
    try {
      if (normalStep === 0) {
        setNormalStep(1);
        setNormalEvents(["公开约定 RFC 3526 MODP 2048 位素数 p 与生成元 g = 2；它们无需保密。​"]);
      } else if (normalStep === 1) {
        const nextAlice = createDhParty();
        const nextBob = createDhParty();
        setAlice(nextAlice);
        setBob(nextBob);
        setNormalStep(2);
        setNormalEvents((current) => [...current, "Alice 随机生成私钥 a，Bob 随机生成私钥 b；两把私钥始终保留在本地。​"]);
      } else if (normalStep === 2) {
        setNormalStep(3);
        setNormalEvents((current) => [...current, "Alice 计算 A = gᵃ mod p，Bob 计算 B = gᵇ mod p，得到各自公钥。​"]);
      } else if (normalStep === 3) {
        setNormalStep(4);
        setNormalEvents((current) => [...current, "Alice 将公钥 A 发给 Bob，Bob 将公钥 B 发给 Alice；私钥 a、b 没有传输。​"]);
      } else if (normalStep === 4) {
        const leftRaw = rawDhSecret(alice.privateKey, bob.publicKey);
        const rightRaw = rawDhSecret(bob.privateKey, alice.publicKey);
        setAliceRawSecret(leftRaw);
        setBobRawSecret(rightRaw);
        setNormalStep(5);
        setNormalEvents((current) => [...current, "Alice 计算 Bᵃ mod p，Bob 计算 Aᵇ mod p；两端独立得到相同的原始共享秘密 S。​"]);
      } else if (normalStep === 5) {
        const [left, right] = await Promise.all([
          completeDh(alice.privateKey, bob.publicKey),
          completeDh(bob.privateKey, alice.publicKey),
        ]);
        setAliceSecret(left);
        setBobSecret(right);
        setNormalStep(6);
        setNormalEvents((current) => [...current, "双方分别对 256 字节原始共享秘密执行 SHA-256，派生出 256 位会话密钥。​"]);
      } else if (normalStep === 6) {
        setNormalStep(7);
        setNormalEvents((current) => [...current, "对比完成：Alice 与 Bob 的会话密钥完全一致，DH 密钥交换成功。​"]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "DH交换失败");
    } finally {
      setBusy(false);
    }
  };

  const runNormalAuto = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setAliceSecret("");
    setBobSecret("");
    setAliceRawSecret("");
    setBobRawSecret("");
    setNormalEvents([]);
    try {
      setNormalStep(1);
      setNormalEvents(["公开约定 RFC 3526 MODP 2048 位素数 p 与生成元 g = 2；它们无需保密。​"]);
      await wait(700);

      const nextAlice = createDhParty();
      const nextBob = createDhParty();
      setAlice(nextAlice);
      setBob(nextBob);
      setNormalStep(2);
      setNormalEvents((current) => [...current, "Alice 随机生成私钥 a，Bob 随机生成私钥 b；两把私钥始终保留在本地。​"]);
      await wait(700);

      setNormalStep(3);
      setNormalEvents((current) => [...current, "根据 A = gᵃ mod p 与 B = gᵇ mod p 计算出双方公钥。​"]);
      await wait(800);

      setNormalStep(4);
      setNormalEvents((current) => [...current, "双方通过公开信道互换公钥 A、B，私钥从未离开本地。​"]);
      await wait(1_000);

      const leftRaw = rawDhSecret(nextAlice.privateKey, nextBob.publicKey);
      const rightRaw = rawDhSecret(nextBob.privateKey, nextAlice.publicKey);
      setAliceRawSecret(leftRaw);
      setBobRawSecret(rightRaw);
      setNormalStep(5);
      setNormalEvents((current) => [...current, "双方分别计算 Bᵃ mod p 与 Aᵇ mod p，得到相同的原始共享秘密 S。​"]);
      await wait(800);

      const [left, right] = await Promise.all([
        completeDh(nextAlice.privateKey, nextBob.publicKey),
        completeDh(nextBob.privateKey, nextAlice.publicKey),
      ]);
      setAliceSecret(left);
      setBobSecret(right);
      setNormalStep(6);
      setNormalEvents((current) => [...current, "对原始共享秘密执行 SHA-256，派生 256 位会话密钥。​"]);
      await wait(750);

      setNormalStep(7);
      setNormalEvents((current) => [...current, "结果校验通过：Alice 与 Bob 的会话密钥完全一致。​"]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "DH自动演示失败");
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
    <div className="dh-readable app-panel panel-reveal soft-scroll h-full min-h-0 w-full overflow-y-auto rounded-[30px] p-5 sm:h-[96%] sm:w-[96%] sm:p-7 lg:p-9">
      <style>{`
        .dh-readable .eyebrow,.dh-readable .field-caption{font-size:.78rem;letter-spacing:.13em}
        .dh-readable .code-line{font-size:.86rem;line-height:1.55;min-height:3rem}
        .dh-readable button{font-size:.96rem}
        .dh-readable .text-sm{font-size:1rem;line-height:1.75rem}
        .dh-readable .dh-actor-grid .code-line{font-size:.94rem;line-height:1.65}
        .dh-readable .dh-flow-line{min-height:3.5rem;font-size:1rem;gap:1rem}
        .dh-readable .dh-flow-line svg{width:1.15rem;height:1.15rem}
        .dh-readable .dh-signature-panel .text-lg,.dh-readable .dh-result-card .text-lg{font-size:1.25rem;line-height:1.75rem}
        .dh-readable .dh-verdict-chip{padding:.65rem .9rem;font-size:.76rem}
        .dh-readable .dh-message-editor textarea{font-size:1rem;line-height:1.7}
        .dh-readable .dh-event-log,.dh-readable .dh-message-trace{padding:1.2rem}
        .dh-readable .dh-event-log li{grid-template-columns:2rem minmax(0,1fr);gap:.75rem;font-size:1rem;line-height:1.75}
        .dh-readable .dh-event-log li+li{margin-top:.7rem}
        .dh-readable .dh-event-log li>span{width:1.75rem;height:1.75rem;font-size:.78rem}
        .dh-readable .dh-message-trace{gap:.75rem}
        .dh-readable .dh-message-trace>div{padding:.9rem 1rem}
        .dh-readable .dh-message-trace>div>span{font-size:.76rem;line-height:1.4}
        .dh-readable .dh-message-trace>div>code{margin-top:.55rem;font-size:.94rem;line-height:1.7}
        .dh-normal-step{border:1px solid rgba(255,255,255,.1);background:rgba(8,18,29,.34);transition:.25s ease}
        .dh-normal-step.is-current{border-color:rgba(184,255,226,.62);background:rgba(105,211,180,.13);box-shadow:0 0 24px rgba(86,217,178,.1)}
        .dh-normal-step.is-done{border-color:rgba(184,255,226,.25);color:rgba(221,255,243,.86)}
        .dh-normal-step-dot{display:grid;place-items:center;width:1.9rem;height:1.9rem;border-radius:999px;background:rgba(255,255,255,.08);font:700 .78rem/1 ui-monospace,monospace}
        .dh-normal-step.is-current .dh-normal-step-dot,.dh-normal-step.is-done .dh-normal-step-dot{background:rgba(179,248,221,.92);color:#10251f}
        .dh-public-channel{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:rgba(5,14,24,.42)}
        .dh-public-channel::before{content:"";position:absolute;left:15%;right:15%;top:50%;height:1px;background:linear-gradient(90deg,rgba(157,237,215,.2),rgba(157,237,215,.8),rgba(157,237,215,.2))}
        .dh-key-packet{position:absolute;top:50%;z-index:1;transform:translateY(-50%);border:1px solid rgba(190,255,236,.62);border-radius:999px;background:#173b36;padding:.42rem .75rem;color:#d9fff3;font:700 .76rem/1 ui-monospace,monospace;opacity:0}
        .dh-public-channel.is-active .dh-key-packet.is-a{animation:dh-send-right 1.8s ease-in-out infinite}
        .dh-public-channel.is-active .dh-key-packet.is-b{animation:dh-send-left 1.8s ease-in-out infinite}
        @keyframes dh-send-right{0%{left:14%;opacity:0}15%,85%{opacity:1}100%{left:76%;opacity:0}}
        @keyframes dh-send-left{0%{right:14%;opacity:0}15%,85%{opacity:1}100%{right:76%;opacity:0}}
      `}</style>
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
          {mode !== "normal" && <button className="secondary-button" data-agent-id="dh.regenerate" type="button" onClick={regenerate}><RefreshCw />重新生成</button>}
        </div>
      </header>

      {mode === "normal" ? (
        <>
          <section className="workspace-card mt-7 rounded-[26px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="eyebrow">NORMAL EXCHANGE / 七步教学演示</p>
                <h2 className="mt-2 text-2xl sm:text-3xl">从公开参数到相同会话密钥</h2>
                <p className="mt-2 text-sm text-white/55">每一步都会保留结果。上层用小数字解释原理，下层用 RFC 3526 参数执行真实运算。</p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/15 px-4 py-2 text-base text-white/70">
                {normalStep === 0 ? "尚未开始" : normalStep >= 7 ? "演示完成" : `当前：${NORMAL_STEPS[normalStep - 1]}`}
              </span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              {NORMAL_STEPS.map((label, index) => {
                const number = index + 1;
                return (
                  <div key={label} className={`dh-normal-step flex items-center gap-2 rounded-2xl px-3 py-3 ${normalStep === number ? "is-current" : ""} ${normalStep > number ? "is-done" : ""}`}>
                    <span className="dh-normal-step-dot">{normalStep > number ? "✓" : number}</span>
                    <span className="text-[0.9rem] font-medium">{label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
            <section className="workspace-card rounded-[26px] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="eyebrow">TEACHING EXAMPLE / 小数字实例</p><h2 className="mt-2 text-2xl">看得懂的 DH 算式</h2></div>
                <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1.5 text-sm text-emerald-100">仅用于教学</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl border p-4 ${normalStep >= 1 ? "border-emerald-200/25 bg-emerald-200/[.07]" : "border-white/10 bg-black/10 opacity-45"}`}>
                  <span className="field-caption">STEP 1 / 公共参数</span>
                  <p className="mt-2 text-xl font-semibold">p = {SMALL_EXAMPLE.p}，g = {SMALL_EXAMPLE.g}</p>
                  <p className="mt-1 text-sm text-white/50">所有参与者都可以知道</p>
                </div>
                <div className={`rounded-2xl border p-4 ${normalStep >= 2 ? "border-emerald-200/25 bg-emerald-200/[.07]" : "border-white/10 bg-black/10 opacity-45"}`}>
                  <span className="field-caption">STEP 2 / 私钥</span>
                  <p className="mt-2 text-xl font-semibold">a = {SMALL_EXAMPLE.alicePrivate}，b = {SMALL_EXAMPLE.bobPrivate}</p>
                  <p className="mt-1 text-sm text-white/50">各自保存，绝不发送</p>
                </div>
                <div className={`rounded-2xl border p-4 sm:col-span-2 ${normalStep >= 3 ? "border-emerald-200/25 bg-emerald-200/[.07]" : "border-white/10 bg-black/10 opacity-45"}`}>
                  <span className="field-caption">STEP 3 / 计算公钥</span>
                  <div className="mt-2 grid gap-2 text-lg sm:grid-cols-2"><code>A = 5⁶ mod 23 = {SMALL_EXAMPLE.alicePublic}</code><code>B = 5¹⁵ mod 23 = {SMALL_EXAMPLE.bobPublic}</code></div>
                </div>
                <div className={`rounded-2xl border p-4 sm:col-span-2 ${normalStep >= 5 ? "border-emerald-200/25 bg-emerald-200/[.07]" : "border-white/10 bg-black/10 opacity-45"}`}>
                  <span className="field-caption">STEP 5 / 独立计算</span>
                  <div className="mt-2 grid gap-2 text-lg sm:grid-cols-2"><code>Alice：19⁶ mod 23 = {SMALL_EXAMPLE.shared}</code><code>Bob：8¹⁵ mod 23 = {SMALL_EXAMPLE.shared}</code></div>
                  <p className="mt-3 text-base text-emerald-100">双方没有传输秘密值，却都得到了 S = {SMALL_EXAMPLE.shared}</p>
                </div>
              </div>
            </section>

            <section className="workspace-card rounded-[26px] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="eyebrow">RFC 3526 / 真实 2048 位运算</p><h2 className="mt-2 text-2xl">浏览器实际计算结果</h2></div>
                <span className="rounded-full border border-sky-200/20 bg-sky-200/10 px-3 py-1.5 text-sm text-sky-100">p：2048 bit · g：2</span>
              </div>
              <div className={`mt-5 rounded-2xl border border-white/10 bg-black/10 p-4 ${normalStep >= 1 ? "" : "opacity-45"}`}>
                <span className="field-caption">PUBLIC PARAMETERS / 公共参数</span>
                <div className="code-line mt-2">p = {normalStep >= 1 ? shortened(DH_P.toString(16), reveal) : "等待展示公开素数…"}</div>
                <p className="mt-2 text-base text-white/60">g = 2　·　模数 p 与生成元 g 可以在公开信道传输</p>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {[
                  { name: "Alice", privateKey: alice.privateKey, publicKey: alice.publicKey, peerPublic: bob.publicKey, raw: aliceRawSecret, secret: aliceSecret, formula: "A = gᵃ mod p", derive: "Sₐ = Bᵃ mod p" },
                  { name: "Bob", privateKey: bob.privateKey, publicKey: bob.publicKey, peerPublic: alice.publicKey, raw: bobRawSecret, secret: bobSecret, formula: "B = gᵇ mod p", derive: "Sᵦ = Aᵇ mod p" },
                ].map((party) => (
                  <article key={party.name} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="flex items-center justify-between"><h3 className="text-2xl italic">{party.name}</h3><span className={`connection-orb ${normalStep >= 7 ? "is-online" : ""}`} /></div>
                    <div className="mt-4 space-y-3">
                      <div><span className="field-caption">私钥（不传输）</span><div className="code-line mt-2">{normalStep >= 2 ? shortened(party.privateKey, reveal) : "等待生成…"}</div></div>
                      <div><span className="field-caption">公钥 · {party.formula}</span><div className="code-line mt-2">{normalStep >= 3 ? shortened(party.publicKey, reveal) : "等待计算…"}</div></div>
                      <div><span className="field-caption">收到的对方公钥</span><div className="code-line mt-2">{normalStep >= 4 ? shortened(party.peerPublic, reveal) : "等待公开交换…"}</div></div>
                      <div><span className="field-caption">原始共享秘密 · {party.derive}</span><div className="code-line mt-2">{normalStep >= 5 ? shortened(party.raw, reveal) : "等待独立计算…"}</div></div>
                      <div><span className="field-caption">SHA-256 会话密钥</span><div className={`code-line mt-2 ${normalStep >= 6 ? "text-emerald-100" : ""}`}>{normalStep >= 6 ? shortened(party.secret, reveal) : "等待派生…"}</div></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className={`dh-public-channel mt-4 min-h-24 rounded-[24px] px-5 py-4 ${normalStep === 4 ? "is-active" : ""}`} aria-label="双方公钥交换动画">
            <div className="relative z-[2] flex h-full min-h-16 items-center justify-between text-lg font-semibold"><span>Alice</span><span className="rounded-full bg-black/40 px-4 py-2 text-base text-white/65">{normalStep < 4 ? "等待交换公钥" : normalStep === 4 ? "公开信道正在传输" : "公钥交换完成"}</span><span>Bob</span></div>
            <span className="dh-key-packet is-a">公钥 A →</span><span className="dh-key-packet is-b">← 公钥 B</span>
          </div>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-base text-white/70"><MessageSquareText className="h-5 w-5" />过程记录</div>
            <ol className="mt-4 grid gap-2 lg:grid-cols-2" aria-live="polite">
              {normalEvents.length ? normalEvents.map((event, index) => <li key={`${index}-${event}`} className="flex gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold">{index + 1}</span><p className="text-base leading-7 text-white/70">{event}</p></li>) : <li className="text-base text-white/45">点击“下一步”逐项观察完整计算过程，或点击“一键演示”。</li>}
            </ol>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto]">
            <div className={`verification-card rounded-[24px] p-5 ${matched ? "is-verified" : ""}`} data-agent-id="dh.normal.result" data-agent-state={matched ? "complete" : "idle"}>
              <div className="flex items-start gap-4">
                <div className="verification-icon">{matched ? <Check /> : <ShieldCheck />}</div>
                <div>
                  <p className="text-xl">{matched ? "交换成功，两端密钥一致" : normalStep >= 6 ? "会话密钥已派生，等待最终对比" : "DH 分步演示进行中"}</p>
                  <p className="mt-1 text-sm leading-6 text-white/45">
                    {matched ? `会话指纹：${aliceSecret.slice(0, 12).toUpperCase()} · ${aliceSecret.slice(-12).toUpperCase()}` : `进度 ${normalStep} / 7：${normalStep ? NORMAL_STEPS[Math.min(normalStep, 7) - 1] : "准备展示公共参数"}`}
                  </p>
                </div>
                {matched && <button className="icon-button ml-auto" data-agent-id="dh.copy-secret" type="button" onClick={() => void navigator.clipboard.writeText(aliceSecret)} title="复制共享密钥"><Copy /></button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button className="secondary-button" data-agent-id="dh.regenerate" type="button" onClick={regenerate} disabled={busy}><RefreshCw />重新开始</button>
              <button className="secondary-button" data-agent-id="dh.normal.next" type="button" onClick={() => void runNormalStep()} disabled={busy || normalStep >= 7}><StepForward />{normalStep === 0 ? "开始 / 下一步" : normalStep >= 7 ? "已完成" : "下一步"}</button>
              <button className="primary-button min-w-40" data-agent-id="dh.exchange" type="button" onClick={() => void runNormalAuto()} disabled={busy}><Play />{busy ? "演示进行中…" : "一键演示"}</button>
            </div>
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
