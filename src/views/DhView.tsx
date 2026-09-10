import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  GitCompareArrows,
  Hash,
  History,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Play,
  Radio,
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

type DemoMode = "normal" | "mitm" | "protected" | "parallel";
type DefenseScenario = "replace" | "replay";

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

const PROTECTED_STEPS = [
  "可信身份",
  "临时DH密钥",
  "组装签名数据",
  "SHA-256摘要",
  "ECDSA签名",
  "Eve发动攻击",
  "身份公钥验证",
  "拒绝交换",
];

const PARALLEL_STEPS = ["同源初始化", "正常协商", "公钥替换", "签名验证", "消息转发", "安全判定"];

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
  const [defenseScenario, setDefenseScenario] = useState<DefenseScenario>("replace");
  const [originalMessage, setOriginalMessage] = useState("转账100元");
  const [modifiedMessage, setModifiedMessage] = useState("转账900元");
  const [events, setEvents] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [normalStep, setNormalStep] = useState(0);
  const [parallelStep, setParallelStep] = useState(0);
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
    setParallelStep(0);
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

  const runProtectedStep = async () => {
    if (busy || step >= 8) return;
    setBusy(true);
    setError("");
    try {
      if (step === 0) {
        const report = await simulateSignatureDefense(alice, bob, eve);
        setSignatureReport(report);
        setStep(1);
        setEvents(["Alice 与 Bob 建立 ECDSA P-256 身份密钥；验证公钥指纹被视为已通过可信渠道预置。"]);
      } else if (step === 1) {
        setStep(2);
        setEvents((current) => [...current, "双方为本轮会话生成临时 DH 密钥对；DH 私钥与身份签名私钥都不会传输。​"]);
      } else if (step === 2) {
        setStep(3);
        setEvents((current) => [...current, "将协议标识、Session ID、发送者角色与临时 DH 公钥组装成待签名数据 M。​"]);
      } else if (step === 3) {
        setStep(4);
        setEvents((current) => [...current, "使用 SHA-256 计算 H(M)；签名不加密公钥，只为数据生成不可伪造的完整性证明。​"]);
      } else if (step === 4) {
        setStep(5);
        setEvents((current) => [...current, "Alice 与 Bob 使用各自的 ECDSA 身份私钥签名摘要，发送 M 与签名 σ。​"]);
      } else if (step === 5) {
        setStep(6);
        setEvents((current) => [...current, defenseScenario === "replace"
          ? "Eve 将签名包中的 DH 公钥替换为自己的公钥，但无法生成 Alice 或 Bob 的身份签名。​"
          : "Eve 重放上一轮中签名合法的旧数据包，试图让接收方接受过期 DH 公钥。​"]);
      } else if (step === 6) {
        setStep(7);
        setEvents((current) => [...current, defenseScenario === "replace"
          ? "接收方使用预置信任的身份公钥验证：收到数据的摘要与原签名不匹配，ECDSA 验证失败。​"
          : "旧包的签名本身有效，但 Session ID 与当前会话不一致且已过期，新鲜度检查失败。​"]);
      } else if (step === 7) {
        setStep(8);
        setEvents((current) => [...current, "系统在计算共享秘密前拒绝数据包，没有生成任何受攻击的会话密钥。​"]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "签名防护演示失败");
    } finally {
      setBusy(false);
    }
  };

  const runProtectedAuto = async () => {
    if (busy) return;
    resetOutcomes();
    setBusy(true);
    setError("");
    try {
      const report = await simulateSignatureDefense(alice, bob, eve);
      setSignatureReport(report);
      const messages = [
        "Alice 与 Bob 的 ECDSA 身份验证公钥已通过可信渠道预置。",
        "双方生成本轮临时 DH 密钥对，身份密钥与 DH 密钥各司其职。",
        "签名数据 M 绑定协议标识、Session ID、角色和临时 DH 公钥。",
        "SHA-256 将 M 变为固定长度摘要；数字签名不会加密这些公开字段。",
        "双方使用 ECDSA 身份私钥生成签名 σ，并公开发送 M 与 σ。",
        defenseScenario === "replace" ? "Eve 替换 DH 公钥，原签名保持不变。" : "Eve 重放上一轮签名合法的旧会话数据包。",
        defenseScenario === "replace" ? "可信身份公钥验证失败：数据已经被替换。" : "签名有效但 Session ID 过期：新鲜度检查拒绝旧包。",
        "交换在派生会话密钥之前终止，攻击被阻止。",
      ];
      for (let index = 0; index < messages.length; index += 1) {
        setStep(index + 1);
        setEvents((current) => [...current, messages[index]]);
        await wait(index === 5 ? 850 : 560);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "签名防护自动演示失败");
    } finally {
      setBusy(false);
    }
  };

  const runParallelStep = async () => {
    if (busy || parallelStep >= 6) return;
    setBusy(true);
    setError("");
    try {
      if (parallelStep === 0) {
        setParallelStep(1);
        setEvents(["三条平行信道复用相同的 Alice、Bob、Eve 密钥与同一条消息，确保实验条件一致。"]);
      } else if (parallelStep === 1) {
        const [left, right] = await Promise.all([
          completeDh(alice.privateKey, bob.publicKey),
          completeDh(bob.privateKey, alice.publicKey),
        ]);
        setAliceSecret(left);
        setBobSecret(right);
        setParallelStep(2);
        setEvents((current) => [...current, "正常信道完成 Alice–Bob 协商，两端得到同一把会话密钥。"]);
      } else if (parallelStep === 2) {
        const secrets = await deriveMitmSecrets(alice, bob, eve);
        setMitmSecrets(secrets);
        setParallelStep(3);
        setEvents((current) => [...current, "攻击信道中 Eve 替换公钥，形成 Alice–Eve 与 Eve–Bob 两把不同密钥。"]);
      } else if (parallelStep === 3) {
        const report = await simulateSignatureDefense(alice, bob, eve);
        setSignatureReport(report);
        setParallelStep(4);
        setEvents((current) => [...current, "防护信道使用可信身份公钥验证签名，在共享秘密生成前识别替换。"]);
      } else if (parallelStep === 4) {
        const secrets = mitmSecrets.aliceSecret ? mitmSecrets : await deriveMitmSecrets(alice, bob, eve);
        const result = await relayMitmMessage(originalMessage, modifiedMessage, secrets);
        setMitmSecrets(secrets);
        setMessageResult(result);
        setParallelStep(5);
        setEvents((current) => [...current, `同一消息在攻击信道被 Eve 从“${result.eveRead}”修改为“${result.bobRead}”，防护信道则未进入消息阶段。`]);
      } else if (parallelStep === 5) {
        setParallelStep(6);
        setEvents((current) => [...current, "对照完成：普通DH保证密钥一致，MITM破坏身份真实性，ECDSA恢复身份与完整性验证。"]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "平行攻防推演失败");
    } finally {
      setBusy(false);
    }
  };

  const runParallelAuto = async () => {
    if (busy) return;
    resetOutcomes();
    setBusy(true);
    setError("");
    try {
      setParallelStep(1);
      setEvents(["三条平行信道使用相同初始条件。"]);
      await wait(600);
      const [left, right] = await Promise.all([
        completeDh(alice.privateKey, bob.publicKey),
        completeDh(bob.privateKey, alice.publicKey),
      ]);
      setAliceSecret(left);
      setBobSecret(right);
      setParallelStep(2);
      setEvents((current) => [...current, "正常信道完成 Alice–Bob 密钥协商。"]);
      await wait(650);
      const secrets = await deriveMitmSecrets(alice, bob, eve);
      setMitmSecrets(secrets);
      setParallelStep(3);
      setEvents((current) => [...current, "攻击信道形成 Alice–Eve 与 Eve–Bob 两把密钥。"]);
      await wait(700);
      const report = await simulateSignatureDefense(alice, bob, eve);
      setSignatureReport(report);
      setParallelStep(4);
      setEvents((current) => [...current, "防护信道发现公钥替换并拒绝交换。"]);
      await wait(700);
      const result = await relayMitmMessage(originalMessage, modifiedMessage, secrets);
      setMessageResult(result);
      setParallelStep(5);
      setEvents((current) => [...current, `攻击信道把“${result.eveRead}”改为“${result.bobRead}”。`]);
      await wait(700);
      setParallelStep(6);
      setEvents((current) => [...current, "三条信道的机密性、身份真实性、完整性与新鲜度判定已生成。"]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "平行攻防自动演示失败");
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
      : mode === "protected"
        ? "拆解 ECDSA P-256 签名输入、摘要、签名包与可信身份公钥验证，并对比公钥替换和旧包重放。"
        : "让相同参数与消息同时通过正常、受攻击和签名防护三条信道，观察每个角色实际掌握的密钥与数据。";

  const attackFinished = mode === "mitm" && step >= 5 && Boolean(messageResult);
  const defenseBlocked = mode === "protected" && step >= 8 && signatureReport !== null
    && (defenseScenario === "replace" ? signatureReport.attackedValid === false : signatureReport.replaySignatureValid && !signatureReport.replayFresh);
  const parallelComplete = mode === "parallel" && parallelStep >= 6;
  const protectedDigest = defenseScenario === "replace" ? signatureReport?.attackedAliceDigest : signatureReport?.replayDigest;
  const protectedSignature = defenseScenario === "replace" ? signatureReport?.aliceSignature : signatureReport?.replaySignature;
  const protectedVerifyLabel = defenseScenario === "replace"
    ? "ECDSA验证失败：DH公钥已被替换"
    : "签名验证通过，但Session ID已过期";

  return (
    <div className={`dh-readable ${mode !== "normal" ? "dh-readable-security" : ""} app-panel panel-reveal soft-scroll h-full min-h-0 w-full overflow-y-auto rounded-[30px] p-5 sm:h-[96%] sm:w-[96%] sm:p-7 lg:p-9`}>
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
        .dh-readable-security .eyebrow,.dh-readable-security .field-caption{color:rgba(255,255,255,.72);font-size:.9rem;line-height:1.55;letter-spacing:.11em}
        .dh-readable-security .code-line{min-height:3.35rem;color:rgba(255,255,255,.8);font-size:1rem;line-height:1.72}
        .dh-readable-security button{font-size:1.02rem}
        .dh-readable-security .text-sm{font-size:1.06rem;line-height:1.85rem}
        .dh-readable-security .dh-actor-grid .code-line{font-size:1rem;line-height:1.72}
        .dh-readable-security .dh-flow-line{min-height:4rem;color:rgba(255,255,255,.7);font-size:1.08rem}
        .dh-readable-security .dh-signature-panel .text-lg,.dh-readable-security .dh-result-card .text-lg{font-size:1.4rem;line-height:1.9rem}
        .dh-readable-security .dh-verdict-chip{font-size:.86rem;line-height:1.25;padding:.72rem 1rem}
        .dh-readable-security .dh-message-editor textarea{font-size:1.06rem;line-height:1.8}
        .dh-readable-security .dh-message-editor .field-label>span{color:rgba(255,255,255,.72);font-size:.9rem}
        .dh-readable-security .dh-demo-console p.text-sm,.dh-readable-security .dh-signature-panel p.text-sm,.dh-readable-security .dh-result-card p.text-sm{color:rgba(255,255,255,.7)}
        .dh-readable-security .dh-event-log,.dh-readable-security .dh-message-trace{padding:1.35rem}
        .dh-readable-security .dh-event-log>div{color:rgba(255,255,255,.88);font-size:1.08rem;line-height:1.75rem}
        .dh-readable-security .dh-event-log li{grid-template-columns:2.2rem minmax(0,1fr);gap:.85rem;color:rgba(255,255,255,.76);font-size:1.08rem;line-height:1.85}
        .dh-readable-security .dh-event-log li.is-empty{color:rgba(255,255,255,.58)}
        .dh-readable-security .dh-event-log li+li{margin-top:.85rem}
        .dh-readable-security .dh-event-log li>span{width:1.9rem;height:1.9rem;font-size:.86rem}
        .dh-readable-security .dh-message-trace{gap:.9rem}
        .dh-readable-security .dh-message-trace>div{padding:1rem 1.1rem}
        .dh-readable-security .dh-message-trace>div>span{color:rgba(255,255,255,.62);font-size:.86rem;line-height:1.55}
        .dh-readable-security .dh-message-trace>div>code{margin-top:.65rem;color:rgba(255,255,255,.76);font-size:1rem;line-height:1.78}
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
        .dh-defense-scenario{width:max-content;max-width:100%;align-self:flex-start;flex:0 0 auto;flex-wrap:nowrap;border-radius:1rem}
        .dh-defense-scenario button{white-space:nowrap}
        .dh-defense-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}
        .dh-defense-step{display:flex;align-items:center;gap:.65rem;min-height:3.6rem;padding:.75rem .85rem;border:1px solid rgba(255,255,255,.1);border-radius:1rem;background:rgba(5,14,24,.3);color:rgba(255,255,255,.48);transition:.25s ease}
        .dh-defense-step strong{display:grid;place-items:center;flex:0 0 1.8rem;height:1.8rem;border-radius:50%;background:rgba(255,255,255,.08);font:700 .78rem/1 ui-monospace,monospace}
        .dh-defense-step span{font-size:.96rem;line-height:1.35}
        .dh-defense-step.is-current{border-color:rgba(244,198,119,.7);background:rgba(161,105,37,.18);color:#fff3d4;box-shadow:0 0 24px rgba(241,176,76,.1)}
        .dh-defense-step.is-done{border-color:rgba(174,242,217,.28);color:rgba(225,255,245,.84)}
        .dh-defense-step.is-done strong{background:rgba(179,248,221,.9);color:#10251f}
        .dh-trust-grid{display:grid;grid-template-columns:1fr minmax(230px,.72fr) 1fr;gap:1rem}
        .dh-trust-card,.dh-key-legend,.dh-packet-card,.dh-verify-card,.dh-parallel-lane,.dh-knowledge-card{border:1px solid rgba(255,255,255,.12);background:rgba(6,14,23,.38);border-radius:1.25rem;padding:1.15rem}
        .dh-trust-card{border-color:rgba(244,198,119,.32)}
        .dh-trust-card h3,.dh-packet-card h3,.dh-parallel-lane h3{font-size:1.28rem;line-height:1.4}
        .dh-trust-status{display:inline-flex;align-items:center;gap:.45rem;margin-top:.8rem;color:#dfffee;font-size:.96rem}
        .dh-key-legend{display:grid;align-content:center;gap:.75rem}
        .dh-key-legend div{display:grid;grid-template-columns:1.8rem 1fr;gap:.65rem;align-items:start}
        .dh-key-legend svg{width:1.25rem;color:#f3ca86}
        .dh-key-legend p{font-size:.95rem;line-height:1.55;color:rgba(255,255,255,.68)}
        .dh-key-legend b{display:block;color:white;font-weight:600}
        .dh-signature-formula{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:.8rem}
        .dh-formula-node{min-width:0;border:1px solid rgba(255,255,255,.12);border-radius:1.15rem;background:rgba(3,10,18,.42);padding:1rem}
        .dh-formula-node.is-gold{border-color:rgba(244,198,119,.42);background:rgba(120,77,27,.16)}
        .dh-formula-node.is-danger{border-color:rgba(255,130,105,.5);background:rgba(128,38,29,.18)}
        .dh-formula-node.is-success{border-color:rgba(160,244,210,.5);background:rgba(45,115,91,.18)}
        .dh-formula-node code{display:block;margin-top:.55rem;color:rgba(255,255,255,.82);font-size:.96rem;line-height:1.7;overflow-wrap:anywhere}
        .dh-formula-arrow{color:rgba(255,255,255,.45)}
        .dh-packet-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
        .dh-packet-fields{display:grid;gap:.55rem;margin-top:1rem}
        .dh-packet-fields div{display:grid;grid-template-columns:8.5rem minmax(0,1fr);gap:.8rem;align-items:start;border-top:1px solid rgba(255,255,255,.08);padding-top:.7rem}
        .dh-packet-fields span{font-size:.9rem;color:rgba(255,255,255,.55)}
        .dh-packet-fields code{font-size:.94rem;line-height:1.55;color:rgba(255,255,255,.82);overflow-wrap:anywhere}
        .dh-packet-fields .is-changed code{color:#ffd0bf}
        .dh-verify-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
        .dh-verify-card{display:flex;gap:1rem;align-items:flex-start}
        .dh-verify-card>svg{flex:0 0 1.6rem;color:#f3ca86}
        .dh-verify-card p{font-size:1rem;line-height:1.7;color:rgba(255,255,255,.7)}
        .dh-security-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}
        .dh-security-grid article{border:1px solid rgba(255,255,255,.1);border-radius:1rem;background:rgba(5,14,24,.32);padding:1rem}
        .dh-security-grid strong{display:block;margin-bottom:.45rem;font-size:1.05rem}
        .dh-security-grid p{font-size:.93rem;line-height:1.55;color:rgba(255,255,255,.62)}
        .dh-parallel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
        .dh-parallel-lane{position:relative;overflow:hidden;min-height:19rem}
        .dh-parallel-lane::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--lane-color,#bcefdc)}
        .dh-parallel-lane.is-attack{--lane-color:#ff8f70}.dh-parallel-lane.is-defense{--lane-color:#f1c778}
        .dh-lane-route{display:flex;align-items:center;justify-content:space-between;margin:1rem 0;padding:.75rem;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(0,0,0,.14);font-size:.96rem}
        .dh-lane-facts{display:grid;gap:.65rem}
        .dh-lane-facts div{border-top:1px solid rgba(255,255,255,.08);padding-top:.65rem}
        .dh-lane-facts span{display:block;font-size:.82rem;color:rgba(255,255,255,.5)}
        .dh-lane-facts strong{display:block;margin-top:.25rem;font-size:1rem;line-height:1.55}
        .dh-knowledge-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}
        .dh-knowledge-card ul{margin:.75rem 0 0;padding-left:1.1rem;color:rgba(255,255,255,.7);font-size:.96rem;line-height:1.75}
        @media(max-width:1050px){.dh-trust-grid,.dh-signature-formula,.dh-parallel-grid{grid-template-columns:1fr}.dh-formula-arrow{transform:rotate(90deg);justify-self:center}.dh-defense-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.dh-security-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:680px){.dh-packet-grid,.dh-verify-grid,.dh-knowledge-grid{grid-template-columns:1fr}.dh-packet-fields div{grid-template-columns:1fr}.dh-defense-steps,.dh-security-grid{grid-template-columns:1fr}.dh-readable-security .dh-defense-step span{font-size:.98rem}}
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
            <button data-agent-id="dh.mode.parallel" type="button" className={mode === "parallel" ? "is-active" : ""} onClick={() => selectMode("parallel")}>平行推演</button>
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
      ) : mode === "protected" ? (
        <>
          <section className="workspace-card mt-7 rounded-[26px] p-5 sm:p-6">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
              <div>
                <p className="eyebrow">AUTHENTICATED DH / 八步机制演示</p>
                <h2 className="mt-2 text-2xl sm:text-3xl">看清数字签名为什么能够阻止攻击</h2>
                <p className="mt-2 max-w-4xl text-sm text-white/60">签名不会加密DH公钥。它把身份、当前会话与临时公钥绑定起来，让接收方在计算共享秘密之前发现替换或重放。</p>
              </div>
              <div className="segmented dh-defense-scenario" aria-label="签名防护攻击场景">
                <button type="button" className={defenseScenario === "replace" ? "is-active" : ""} onClick={() => { setDefenseScenario("replace"); resetOutcomes(); }}>公钥替换</button>
                <button type="button" className={defenseScenario === "replay" ? "is-active" : ""} onClick={() => { setDefenseScenario("replay"); resetOutcomes(); }}>旧包重放</button>
              </div>
            </div>
            <div className="dh-defense-steps mt-5">
              {PROTECTED_STEPS.map((label, index) => {
                const number = index + 1;
                return <div key={label} className={`dh-defense-step ${step === number ? "is-current" : ""} ${step > number ? "is-done" : ""}`}><strong>{step > number ? "✓" : number}</strong><span>{label}</span></div>;
              })}
            </div>
          </section>

          <section className="dh-trust-grid mt-4" aria-label="可信身份与两套密钥">
            <article className="dh-trust-card">
              <div className="flex items-center gap-3"><Fingerprint className="text-amber-200" /><div><p className="eyebrow">ALICE IDENTITY / 长期身份</p><h3>Alice ECDSA身份公钥</h3></div></div>
              <div className="code-line mt-3">{step >= 1 && signatureReport ? shortened(signatureReport.aliceFingerprint, reveal) : "等待建立可信身份…"}</div>
              <p className="dh-trust-status"><ShieldCheck className="h-5 w-5" />Bob已通过可信渠道预置该公钥指纹</p>
            </article>
            <article className="dh-key-legend">
              <div><KeyRound /><p><b>DH临时密钥</b>负责计算共享秘密，每轮重新生成。</p></div>
              <div><Fingerprint /><p><b>ECDSA身份密钥</b>私钥负责签名，可信公钥负责验证身份。</p></div>
              <div><Eye /><p><b>公开发送</b>Session ID、角色、DH公钥和签名；两种私钥都不传输。</p></div>
            </article>
            <article className="dh-trust-card">
              <div className="flex items-center gap-3"><Fingerprint className="text-amber-200" /><div><p className="eyebrow">BOB IDENTITY / 长期身份</p><h3>Bob ECDSA身份公钥</h3></div></div>
              <div className="code-line mt-3">{step >= 1 && signatureReport ? shortened(signatureReport.bobFingerprint, reveal) : "等待建立可信身份…"}</div>
              <p className="dh-trust-status"><ShieldCheck className="h-5 w-5" />Alice已通过可信渠道预置该公钥指纹</p>
            </article>
          </section>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="eyebrow">SIGNATURE PIPELINE / 签名作用机制</p><h2 className="mt-2 text-2xl">数据组装、摘要与签名</h2></div>
              <span className="dh-verdict-chip">ECDSA P-256 / SHA-256</span>
            </div>
            <div className="dh-signature-formula mt-5">
              <div className={`dh-formula-node ${step >= 3 ? "is-gold" : ""}`}><span className="field-caption">① 待签名数据 M</span><code>{step >= 3 && signatureReport ? shortened(signatureReport.alicePayload, reveal) : "协议标识 | Session ID | Alice | DH公钥A"}</code></div>
              <ArrowRight className="dh-formula-arrow" />
              <div className={`dh-formula-node ${step >= 4 ? "is-gold" : ""}`}><span className="field-caption">② SHA-256 摘要 H(M)</span><code>{step >= 4 && signatureReport ? shortened(signatureReport.aliceDigest, reveal) : "等待计算摘要…"}</code></div>
              <ArrowRight className="dh-formula-arrow" />
              <div className={`dh-formula-node ${step >= 5 ? "is-success" : ""}`}><span className="field-caption">③ ECDSA身份私钥签名</span><code>{step >= 5 && signatureReport ? shortened(signatureReport.aliceSignature, reveal) : "σ = Sign(SK_Alice, H(M))"}</code></div>
            </div>
            <p className="mt-4 text-base leading-7 text-white/65"><b className="text-white">关键结论：</b>数字签名没有把任何字段变成密文。接收方仍能看到所有公开字段，但任何字段变化都会破坏签名验证。</p>
          </section>

          <section className="dh-packet-grid mt-4" aria-label="签名包修改前后对比">
            <article className="dh-packet-card">
              <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">GENUINE PACKET / Alice原始签名包</p><h3>签名时的数据</h3></div><Radio className="text-emerald-200" /></div>
              <div className="dh-packet-fields">
                <div><span>协议标识</span><code>LUMORA-DH-SIGNED-V1</code></div>
                <div><span>Session ID</span><code>{step >= 3 && signatureReport ? signatureReport.sessionId : "等待生成…"}</code></div>
                <div><span>发送者角色</span><code>Alice</code></div>
                <div><span>临时DH公钥</span><code>{step >= 2 ? shortened(alice.publicKey, reveal) : "等待生成…"}</code></div>
                <div><span>数字签名 σ</span><code>{step >= 5 && signatureReport ? shortened(signatureReport.aliceSignature, reveal) : "等待身份私钥签名…"}</code></div>
              </div>
            </article>
            <article className={`dh-packet-card ${step >= 6 ? "border-red-300/40" : ""}`}>
              <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">RECEIVED PACKET / 接收方实际收到</p><h3>{defenseScenario === "replace" ? "Eve替换DH公钥" : "Eve重放旧会话包"}</h3></div><ShieldAlert className="text-orange-200" /></div>
              <div className="dh-packet-fields">
                <div><span>协议标识</span><code>LUMORA-DH-SIGNED-V1</code></div>
                <div className={defenseScenario === "replay" && step >= 6 ? "is-changed" : ""}><span>Session ID</span><code>{step >= 6 && signatureReport ? (defenseScenario === "replace" ? signatureReport.sessionId : signatureReport.previousSessionId) : "等待Eve介入…"}</code></div>
                <div><span>发送者角色</span><code>Alice</code></div>
                <div className={defenseScenario === "replace" && step >= 6 ? "is-changed" : ""}><span>临时DH公钥</span><code>{step >= 6 ? shortened(defenseScenario === "replace" ? eve.publicKey : alice.publicKey, reveal) : "等待Eve介入…"}</code></div>
                <div><span>携带的签名 σ</span><code>{step >= 6 && protectedSignature ? shortened(protectedSignature, reveal) : "等待Eve介入…"}</code></div>
              </div>
              {step >= 6 && <div className="mt-3 rounded-xl border border-red-200/15 bg-red-950/15 p-3 text-base leading-7 text-red-100/80">{defenseScenario === "replace" ? "Eve只能更换公钥，无法用Alice身份私钥重签。" : "旧包签名真实，但它绑定的是上一轮Session ID。"}</div>}
            </article>
          </section>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6">
            <div><p className="eyebrow">VERIFY / 身份公钥验证</p><h2 className="mt-2 text-2xl">接收方先验证，再决定是否执行DH</h2></div>
            <div className="dh-verify-grid mt-5">
              <article className="dh-verify-card"><Hash /><div><h3 className="text-lg">重新计算收到数据的摘要</h3><div className="code-line mt-2">{step >= 7 && protectedDigest ? shortened(protectedDigest, reveal) : "H(M_received) 等待计算…"}</div><p className="mt-2">{defenseScenario === "replace" ? "公钥变化导致摘要与原签名不再匹配。" : "旧包摘要与旧签名仍匹配，因此还必须检查会话新鲜度。"}</p></div></article>
              <article className={`dh-verify-card ${step >= 7 ? "border-red-300/35" : ""}`}><Fingerprint /><div><h3 className="text-lg">使用预置信任的Alice身份公钥</h3><div className="code-line mt-2">{step >= 1 && signatureReport ? shortened(signatureReport.aliceFingerprint, reveal) : "等待可信身份公钥…"}</div><p className="mt-2">{step >= 7 ? protectedVerifyLabel : "Verify(PK_Alice, H(M_received), σ) 等待执行…"}</p></div></article>
            </div>
            {defenseScenario === "replay" && <div className="dh-verify-grid mt-4"><article className="dh-verify-card"><History /><div><h3 className="text-lg">签名真实性检查</h3><p className="mt-2">{step >= 7 && signatureReport ? `旧签名验证：${signatureReport.replaySignatureValid ? "通过" : "失败"}` : "等待检查旧签名…"}</p></div></article><article className={`dh-verify-card ${step >= 7 ? "border-red-300/35" : ""}`}><CircleX /><div><h3 className="text-lg">Session ID新鲜度检查</h3><p className="mt-2">{step >= 7 && signatureReport ? `当前 ${signatureReport.sessionId}，旧包 ${signatureReport.previousSessionId}：拒绝重放` : "等待比较当前会话与旧会话…"}</p></div></article></div>}
          </section>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6">
            <div className="dh-security-grid">
              <article><strong>身份真实性</strong><p>{step >= 8 ? "可信ECDSA公钥确认发送者身份。" : "等待验证身份…"}</p></article>
              <article><strong>数据完整性</strong><p>{step >= 8 ? "DH公钥被替换后签名失效。" : "等待检查数据…"}</p></article>
              <article><strong>会话新鲜性</strong><p>{step >= 8 ? "Session ID绑定本轮并拒绝旧包。" : "等待检查Session ID…"}</p></article>
              <article><strong>数据保密性</strong><p>签名不提供保密，DH公钥和签名仍可公开。</p></article>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]">
              <div className="dh-event-log"><div className="flex items-center gap-2 text-sm text-white/65"><MessageSquareText className="h-4 w-4" />过程日志</div><ol className="mt-3 space-y-2" aria-live="polite">{events.length ? events.map((event, index) => <li key={`${index}-${event}`}><span>{index + 1}</span><p>{event}</p></li>) : <li className="is-empty"><span>0</span><p>选择攻击场景后点击“下一步”，观察签名包如何生成和验证。</p></li>}</ol></div>
              <div className="flex flex-wrap content-end gap-2 xl:max-w-[340px] xl:justify-end"><button className="secondary-button" type="button" onClick={resetOutcomes} disabled={busy}><RefreshCw />重新开始</button><button className="secondary-button" type="button" onClick={() => void runProtectedStep()} disabled={busy || step >= 8}><StepForward />{step >= 8 ? "已完成" : "下一步"}</button><button className="primary-button" type="button" onClick={() => void runProtectedAuto()} disabled={busy}><Play />{busy ? "演示进行中…" : "一键演示"}</button></div>
            </div>
          </section>

          <div className={`verification-card dh-result-card mt-4 rounded-[24px] p-5 ${defenseBlocked ? "is-verified" : ""}`}><div className="flex items-start gap-4"><div className="verification-icon">{defenseBlocked ? <ShieldCheck /> : <LockKeyhole />}</div><div><p className="text-lg">{defenseBlocked ? (defenseScenario === "replace" ? "公钥替换已阻止" : "旧包重放已阻止") : "等待执行身份认证"}</p><p className="mt-1 text-sm text-white/55">{defenseBlocked ? "系统在计算共享秘密前拒绝数据包，没有建立任何受攻击的会话密钥。" : "签名绑定身份、Session ID与临时DH公钥；可信身份公钥负责最后验证。"}</p></div><span className={`dh-verdict-chip ml-auto ${defenseBlocked ? "is-danger" : ""}`}>{defenseBlocked ? "BLOCKED" : `${step} / 8`}</span></div></div>
        </>
      ) : mode === "parallel" ? (
        <>
          <section className="workspace-card mt-7 rounded-[26px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div><p className="eyebrow">PARALLEL CHANNELS / 同源对照实验</p><h2 className="mt-2 text-2xl sm:text-3xl">同一组参数，三条信道，三种安全结局</h2><p className="mt-2 max-w-4xl text-sm text-white/60">三条信道复用相同的Alice、Bob、Eve密钥与消息，排除随机差异，只比较身份认证是否存在。</p></div><span className="rounded-full border border-white/10 bg-black/15 px-4 py-2 text-base text-white/70">{parallelComplete ? "推演完成" : `进度 ${parallelStep} / 6`}</span></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 2xl:grid-cols-6">{PARALLEL_STEPS.map((label, index) => { const number = index + 1; return <div key={label} className={`dh-normal-step flex items-center gap-2 rounded-2xl px-3 py-3 ${parallelStep === number ? "is-current" : ""} ${parallelStep > number ? "is-done" : ""}`}><span className="dh-normal-step-dot">{parallelStep > number ? "✓" : number}</span><span className="text-[0.94rem] font-medium">{label}</span></div>; })}</div>
          </section>

          <div className="dh-message-editor mt-4"><label className="field-label"><span>ALICE MESSAGE / 同源消息</span><textarea className="field-control" rows={2} value={originalMessage} onChange={(event) => setOriginalMessage(event.target.value)} disabled={busy} /></label><label className="field-label"><span>EVE MODIFICATION / 攻击目标</span><textarea className="field-control" rows={2} value={modifiedMessage} onChange={(event) => setModifiedMessage(event.target.value)} disabled={busy} /></label></div>

          <section className="dh-parallel-grid mt-4" aria-label="三条平行信道">
            <article className="dh-parallel-lane"><p className="eyebrow">CHANNEL A / 正常DH</p><h3>Alice与Bob直接协商</h3><div className="dh-lane-route"><span>Alice</span><ArrowRight /><span>Bob</span></div><div className="dh-lane-facts"><div><span>会话密钥</span><strong>{parallelStep >= 2 && aliceSecret ? `两端一致 · ${shortened(aliceSecret, false)}` : "等待正常协商…"}</strong></div><div><span>消息结果</span><strong>{parallelStep >= 5 ? `Bob收到“${originalMessage}”` : "等待传输…"}</strong></div><div><span>安全结论</span><strong className="text-emerald-100">{parallelComplete ? "密钥一致，但单独DH没有身份认证" : "等待判定…"}</strong></div></div></article>
            <article className="dh-parallel-lane is-attack"><p className="eyebrow">CHANNEL B / 中间人攻击</p><h3>Eve建立两条加密链路</h3><div className="dh-lane-route"><span>Alice</span><ShieldAlert /><span>Eve</span><ShieldAlert /><span>Bob</span></div><div className="dh-lane-facts"><div><span>会话密钥</span><strong>{parallelStep >= 3 && mitmSecrets.aliceSecret ? "K(Alice,Eve) ≠ K(Eve,Bob)" : "等待Eve替换公钥…"}</strong></div><div><span>消息结果</span><strong>{parallelStep >= 5 && messageResult ? `Eve读到“${messageResult.eveRead}”，Bob收到“${messageResult.bobRead}”` : "等待截获…"}</strong></div><div><span>安全结论</span><strong className="text-orange-100">{parallelComplete ? "通信继续，但身份与消息被控制" : "等待判定…"}</strong></div></div></article>
            <article className="dh-parallel-lane is-defense"><p className="eyebrow">CHANNEL C / 签名防护</p><h3>先认证公钥，再执行DH</h3><div className="dh-lane-route"><span>Alice</span><LockKeyhole /><span>Bob</span></div><div className="dh-lane-facts"><div><span>身份验证</span><strong>{parallelStep >= 4 && signatureReport ? "替换公钥的ECDSA验证失败" : "等待可信公钥验证…"}</strong></div><div><span>消息结果</span><strong>{parallelStep >= 5 ? "交换已终止，未发送受攻击消息" : "等待验证…"}</strong></div><div><span>安全结论</span><strong className="text-amber-100">{parallelComplete ? "攻击在会话密钥生成前被阻止" : "等待判定…"}</strong></div></div></article>
          </section>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6"><div><p className="eyebrow">WHO KNOWS WHAT / 角色知识图谱</p><h2 className="mt-2 text-2xl">每一步之后，谁实际掌握了什么</h2></div><div className="dh-knowledge-grid mt-5"><article className="dh-knowledge-card"><h3 className="text-xl italic">Alice</h3><ul><li>始终掌握自己的DH私钥</li><li>{parallelStep >= 2 ? "正常信道掌握K(Alice,Bob)" : "等待生成正常会话密钥"}</li><li>{parallelStep >= 3 ? "攻击信道误把K(Alice,Eve)当作Bob密钥" : "尚未被Eve欺骗"}</li></ul></article><article className="dh-knowledge-card"><h3 className="text-xl italic text-orange-100">Eve</h3><ul><li>始终能看到公开参数与公钥</li><li>{parallelStep >= 3 ? "攻击信道掌握两把会话密钥" : "只有公开信息"}</li><li>{parallelStep >= 5 ? `读到“${messageResult?.eveRead}”并完成篡改` : "尚未获得消息明文"}</li></ul></article><article className="dh-knowledge-card"><h3 className="text-xl italic">Bob</h3><ul><li>始终掌握自己的DH私钥</li><li>{parallelStep >= 2 ? "正常信道掌握K(Alice,Bob)" : "等待生成正常会话密钥"}</li><li>{parallelStep >= 4 ? "防护信道识别签名异常" : "等待身份验证"}</li></ul></article></div></section>

          <section className="workspace-card mt-4 rounded-[26px] p-5 sm:p-6"><div className="dh-security-grid"><article><strong>正常DH</strong><p>{parallelComplete ? "机密性依赖大数难题，缺少身份认证。" : "等待推演…"}</p></article><article><strong>MITM攻击</strong><p>{parallelComplete ? "Eve获得链路两端密钥，可解密并重签密文。" : "等待推演…"}</p></article><article><strong>ECDSA防护</strong><p>{parallelComplete ? "可信身份公钥发现替换，拒绝继续DH。" : "等待推演…"}</p></article><article><strong>核心变量</strong><p>{parallelComplete ? "三条信道只改变是否验证身份，其余初始条件相同。" : "相同参数与消息已经准备。"}</p></article></div><div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]"><div className="dh-event-log"><div className="flex items-center gap-2 text-sm text-white/65"><GitCompareArrows className="h-5 w-5" />同步推演日志</div><ol className="mt-3 space-y-2">{events.length ? events.map((event, index) => <li key={`${index}-${event}`}><span>{index + 1}</span><p>{event}</p></li>) : <li className="is-empty"><span>0</span><p>点击“下一步”同步观察三条信道，或使用“一键推演”。</p></li>}</ol></div><div className="flex flex-wrap content-end gap-2 xl:max-w-[350px] xl:justify-end"><button className="secondary-button" type="button" onClick={resetOutcomes} disabled={busy}><RefreshCw />重新开始</button><button className="secondary-button" type="button" onClick={() => void runParallelStep()} disabled={busy || parallelStep >= 6}><StepForward />{parallelComplete ? "已完成" : "下一步"}</button><button className="primary-button" type="button" onClick={() => void runParallelAuto()} disabled={busy}><Play />{busy ? "推演进行中…" : "一键推演"}</button></div></div></section>

          <div className={`verification-card dh-result-card mt-4 rounded-[24px] p-5 ${parallelComplete ? "is-verified" : ""}`}><div className="flex items-start gap-4"><div className="verification-icon">{parallelComplete ? <GitCompareArrows /> : <Radio />}</div><div><p className="text-lg">{parallelComplete ? "平行攻防推演完成" : "等待三条信道同步运行"}</p><p className="mt-1 text-sm text-white/55">{parallelComplete ? "相同初始条件下，身份认证成为正常通信、攻击成功与防护成功之间的决定性差异。" : "这里不是三次随机实验，而是同一组密钥和消息的反事实对照。"}</p></div></div></div>
        </>
      ) : (
        <>
          <div className="dh-actor-grid is-attacking mt-7">
            {partyCard("Alice", "SENDER / 发送方", alice, mitmSecrets.aliceSecret, "SESSION KEY / Alice ↔ Eve")}
            <article className={`workspace-card dh-party-card dh-eve-card rounded-[28px] p-5 sm:p-6 ${step >= 2 ? "is-intercepting" : ""}`} data-agent-id="dh.eve">
              <div className="flex items-center justify-between">
                <div><p className="eyebrow">ATTACKER / 中间人</p><h2 className="mt-1 text-3xl italic">Eve</h2></div>
                <span className={`connection-orb ${step >= 2 ? "is-danger" : ""}`} />
              </div>
              <div className="mt-6 space-y-4">
                <div><span className="field-caption">PUBLIC KEY / 用于替换的公钥</span><div className="code-line mt-2">{shortened(eve.publicKey, reveal)}</div></div>
                <div><span className="field-caption">SESSION KEY / Eve ↔ Alice</span><div className={`code-line mt-2 ${mitmSecrets.eveAliceSecret ? "text-orange-100" : "text-white/25"}`}>{mitmSecrets.eveAliceSecret ? shortened(mitmSecrets.eveAliceSecret, reveal) : "等待截获Alice公钥…"}</div></div>
                <div><span className="field-caption">SESSION KEY / Eve ↔ Bob</span><div className={`code-line mt-2 ${mitmSecrets.eveBobSecret ? "text-orange-100" : "text-white/25"}`}>{mitmSecrets.eveBobSecret ? shortened(mitmSecrets.eveBobSecret, reveal) : "等待截获Bob公钥…"}</div></div>
              </div>
            </article>
            {partyCard("Bob", "RECEIVER / 接收方", bob, mitmSecrets.bobSecret, "SESSION KEY / Eve ↔ Bob")}
          </div>

          <div className="dh-flow-line mt-4" data-agent-id="dh.flow" aria-label="公钥传递路径"><span>Alice公钥</span><ArrowRight /><strong>{step >= 2 ? "Eve截获并替换" : "等待传输"}</strong><ArrowRight /><span>Bob</span></div>

          <section className="workspace-card dh-demo-console mt-4 rounded-[26px] p-5 sm:p-6" data-agent-id="dh.demo">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div><p className="eyebrow">INTERACTIVE TRACE / 交互演示</p><h2 className="mt-1 text-2xl italic">Message interception</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">使用真实DH派生密钥与AES-GCM完成截获、解密、修改和转发。</p></div>
              <div className="flex flex-wrap gap-2"><button className="secondary-button" data-agent-id="dh.demo.next" type="button" disabled={busy || step >= 5} onClick={() => void nextStep()}><StepForward />下一步</button><button className="primary-button" data-agent-id="dh.demo.auto" type="button" disabled={busy} onClick={() => void autoDemo()}><Play />{busy ? "演示进行中…" : "一键演示"}</button></div>
            </div>

            <div className="dh-message-editor mt-5"><label className="field-label"><span>ALICE MESSAGE / 原始消息</span><textarea className="field-control" data-agent-id="dh.message.original" rows={2} value={originalMessage} onChange={(event) => setOriginalMessage(event.target.value)} disabled={busy} /></label><label className="field-label"><span>EVE MODIFICATION / 篡改内容</span><textarea className="field-control" data-agent-id="dh.message.modified" rows={2} value={modifiedMessage} onChange={(event) => setModifiedMessage(event.target.value)} disabled={busy} /></label></div>

            <div className="dh-trace-grid mt-5">
              <div className="dh-event-log"><div className="flex items-center gap-2 text-sm text-white/65"><MessageSquareText className="h-4 w-4" />过程日志</div><ol className="mt-3 space-y-2" aria-live="polite">{events.length ? events.map((event, index) => <li key={`${index}-${event}`}><span>{index + 1}</span><p>{event}</p></li>) : <li className="is-empty"><span>0</span><p>点击“下一步”逐步观察，或使用“一键演示”。</p></li>}</ol></div>
              <div className="dh-message-trace">
                <><div><span>ALICE → EVE / AES-GCM密文</span><code>{step >= 4 && messageResult ? shortened(messageResult.aliceCiphertext, reveal) : "等待Alice发送加密消息…"}</code></div><div className={step >= 4 ? "is-exposed" : ""}><span>EVE DECRYPTED / 截获明文</span><code>{step >= 4 && messageResult ? messageResult.eveRead : "等待Eve解密…"}</code></div><div className={step >= 5 ? "is-exposed" : ""}><span>BOB RECEIVED / 最终收到</span><code>{step >= 5 && messageResult ? messageResult.bobRead : "等待Eve重新加密并转发…"}</code></div></>
              </div>
            </div>
          </section>

          <div className={`verification-card dh-result-card mt-4 rounded-[24px] p-5 ${attackFinished ? "is-attacked" : ""}`} data-agent-id="dh.result" data-agent-state={attackFinished ? "attack-complete" : "idle"}><div className="flex items-start gap-4"><div className="verification-icon">{attackFinished ? <ShieldAlert /> : <AlertTriangle />}</div><div><p className="text-lg">{attackFinished ? "中间人攻击成功" : "等待开始安全实验"}</p><p className="mt-1 text-sm leading-6 text-white/45">{attackFinished ? "Alice和Bob都能正常通信，但实际分别与Eve共享不同密钥，双方不会仅凭DH发现攻击。" : "整个实验只在当前浏览器内模拟三个角色，不连接房间或真实设备。"}</p></div></div></div>
        </>
      )}

      {error && <div className="status-note is-error mt-4"><AlertTriangle /><span>{error}</span></div>}
    </div>
  );
}
