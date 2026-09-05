import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Clipboard,
  File,
  FileDown,
  FileUp,
  Link,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Send,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  aesDecryptBytes,
  aesEncryptBytes,
  algorithms,
  completeDh,
  createDhParty,
  createSm2KeyPair,
  md5,
  processAlgorithm,
  requireWebCrypto,
  sm2Decrypt,
  sm2Encrypt,
  type AlgorithmId,
  type DhParty,
  type Sm2KeyPair,
} from "../crypto/engine";
import { buildRelayAddress, defaultRelayUrl, splitRelayAddress, normalizeRoom, RELAY_PROTOCOL_VERSION } from "../network/connection";
import "./NetworkView.css";

type Role = "encryptor" | "decryptor";
type Status = "offline" | "connecting" | "waiting" | "secure" | "error";

interface ChatItem {
  id: string;
  sequence: number;
  direction: "out" | "in" | "system";
  text: string;
  algorithm?: string;
  verified?: boolean;
  cipher?: string;
  time: string;
}

interface ReceivedFile {
  id: string;
  sequence: number;
  name: string;
  size: number;
  url: string;
  verified: boolean;
  direction: "out" | "in";
}

interface WireMessage {
  type: string;
  [key: string]: unknown;
}

const networkAlgorithms = algorithms.filter((item) => item.network);

const timeNow = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function cipherKeys(algorithm: AlgorithmId, shared: string) {
  if (algorithm === "double") return { key: shared.slice(0, 24), secondKey: shared.slice(24, 48) };
  return { key: shared };
}

function CipherBlock({ cipher, outbound, onCopy }: { cipher: string; outbound: boolean; onCopy: (text: string) => void }) {
  return (
    <details className="chat-cipher">
      <summary>
        <span className="chat-cipher-label">{outbound ? "密文" : "收到密文"}</span>
        <span className="chat-cipher-preview">{cipher}</span>
      </summary>
      <div className="chat-cipher-body">
        <button className="chat-cipher-copy" type="button" onClick={() => onCopy(cipher)} title="复制密文">复制</button>
        {cipher}
      </div>
    </details>
  );
}

export default function NetworkView() {
  const [role, setRole] = useState<Role>("encryptor");
  const [room, setRoom] = useState(() => "LUM-" + Math.random().toString(36).slice(2, 7).toUpperCase());
  const [relayAddress, setRelayAddress] = useState(() => {
    try { return splitRelayAddress(localStorage.getItem("lumora-relay-url") || defaultRelayUrl(location.href), location.href); }
    catch { return splitRelayAddress(defaultRelayUrl(location.href), location.href); }
  });
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [serverId, setServerId] = useState("");
  const [status, setStatus] = useState<Status>("offline");
  const [statusText, setStatusText] = useState("选择同一个中继服务器，再填写相同房间码");
  const [peerPresent, setPeerPresent] = useState(false);
  const [peerDh, setPeerDh] = useState("");
  const [sharedSecret, setSharedSecret] = useState("");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgorithmId>("aes");
  const [negotiatedAlgorithm, setNegotiatedAlgorithm] = useState<AlgorithmId | null>(null);
  const [pendingAlgorithm, setPendingAlgorithm] = useState<AlgorithmId | null>(null);
  const [peerSm2, setPeerSm2] = useState<Sm2KeyPair["public"] | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [shareFeedback, setShareFeedback] = useState<{ action: "used" | "copied"; url: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const secretRef = useRef("");
  const negotiatedRef = useRef<AlgorithmId | null>(null);
  const proposalRef = useRef<AlgorithmId | null>(null);
  const peerPresentRef = useRef(false);
  const connectTimerRef = useRef<number | undefined>(undefined);
  const shareFeedbackTimerRef = useRef<number | undefined>(undefined);
  const fileUrlsRef = useRef(new Set<string>());
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedAlgorithmRef = useRef(selectedAlgorithm);
  selectedAlgorithmRef.current = selectedAlgorithm;
  const logRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);

  const nextSequence = () => ++sequenceRef.current;

  const append = (item: Omit<ChatItem, "id" | "time" | "sequence">) => {
    const entry: ChatItem = { ...item, id: crypto.randomUUID(), time: timeNow(), sequence: nextSequence() };
    setMessages((current) => [...current, entry]);
  };

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, files]);

  useEffect(() => {
    let disposed = false;
    void fetch("/api/relay/info").then((response) => response.json()).then((info: { lanUrls?: string[] }) => {
      if (!disposed && Array.isArray(info.lanUrls)) setLanUrls(info.lanUrls);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);

  useEffect(() => () => {
    window.clearTimeout(connectTimerRef.current);
    window.clearTimeout(shareFeedbackTimerRef.current);
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    fileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    fileUrlsRef.current.clear();
  }, []);

  const clearPeer = () => {
    secretRef.current = "";
    negotiatedRef.current = null;
    proposalRef.current = null;
    peerPresentRef.current = false;
    setSharedSecret("");
    setPeerDh("");
    setPeerSm2(null);
    setPeerPresent(false);
    setNegotiatedAlgorithm(null);
    setPendingAlgorithm(null);
  };

  const sendWire = (payload: WireMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("Socket 尚未连接");
    socket.send(JSON.stringify(payload));
  };

  const disconnect = () => {
    window.clearTimeout(connectTimerRef.current);
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    clearPeer();
    setServerId("");
    setStatus("offline");
    setStatusText("连接已断开");
  };

  const connect = () => {
    try {
      requireWebCrypto();
      const endpoint = buildRelayAddress(relayAddress, location.href);
      const roomCode = normalizeRoom(room);
      disconnect();
      setRelayAddress(splitRelayAddress(endpoint, location.href));
      setRoom(roomCode);
      setError("");
      setMessages([]);
      fileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      fileUrlsRef.current.clear();
      setFiles([]);
      setStatus("connecting");
      setStatusText("正在连接中继服务器…");
      const socket = new WebSocket(endpoint);
      socketRef.current = socket;
      let localId = "";
      let peerId = "";
      let localDh: DhParty | null = null;
      let localSm2: Sm2KeyPair | null = null;
      let incoming = Promise.resolve();
      const current = () => socketRef.current === socket;

      const fail = (text: string) => {
        if (!current()) return;
        window.clearTimeout(connectTimerRef.current);
        socketRef.current = null;
        socket.close();
        clearPeer();
        setServerId("");
        setStatus("error");
        setStatusText(text);
        setError(text);
      };
      connectTimerRef.current = window.setTimeout(() => fail("连接中继超时。请确认地址、两端网络互通，以及服务端防火墙允许该端口。"), 12_000);
      socket.onopen = () => {
        if (current()) socket.send(JSON.stringify({ type: "join", protocolVersion: RELAY_PROTOCOL_VERSION, room: roomCode, role }));
      };
      socket.onmessage = (event) => {
        incoming = incoming.then(async () => {
          if (!current()) return;
          const data = JSON.parse(String(event.data)) as WireMessage;
          if (data.type === "welcome") {
            if (data.protocolVersion !== RELAY_PROTOCOL_VERSION) { fail("中继版本不一致，请两端及中继都使用新版源码包"); return; }
            localId = String(data.id);
            setServerId(String(data.serverId));
          } else if (data.type === "joined") {
            window.clearTimeout(connectTimerRef.current);
            localId = String(data.id);
            setServerId(String(data.serverId));
            try { localStorage.setItem("lumora-relay-url", endpoint); } catch { /* storage is optional */ }
            setStatus("waiting");
            setStatusText("已加入 " + String(data.room) + "，等待另一端连接同一个中继");
            append({ direction: "system", text: "已作为" + (role === "encryptor" ? "加密端" : "解密端") + "加入房间 " + roomCode });
          } else if (data.type === "join-error" || data.type === "room-full") {
            fail(String(data.message || "房间已满，请更换房间码"));
          } else if (data.type === "error") {
            setError(String(data.message));
          } else if (data.type === "roster") {
            const members = data.members as Array<{ id: string; role: Role }>;
            const peer = members.find((member) => member.id !== localId);
            if (peer?.id === peerId) return;
            peerId = peer?.id || "";
            clearPeer();
            if (!peer) {
              localDh = null;
              localSm2 = null;
              setStatus("waiting");
              setStatusText("等待另一端：请核对中继服务标识、房间码和相反角色");
              return;
            }
            if (peer.role === role) { fail("两端角色相同，请一端选择加密端、一端选择解密端"); return; }
            localDh = createDhParty();
            localSm2 = createSm2KeyPair();
            peerPresentRef.current = true;
            setPeerPresent(true);
            setStatus("waiting");
            setStatusText("对端已连接，正在执行新的 DH 公钥交换…");
            sendWire({ type: "dh-public", publicKey: localDh.publicKey });
            sendWire({ type: "sm2-public", publicKey: localSm2.public });
            if (role === "encryptor") {
              proposalRef.current = selectedAlgorithmRef.current;
              sendWire({ type: "algorithm-proposal", algorithm: selectedAlgorithmRef.current });
            }
          } else if (data.senderId && data.senderId === peerId) {
            if (data.type === "dh-public") {
              if (!localDh) throw new Error("尚未建立本端 DH 参数");
              const publicKey = String(data.publicKey);
              const secret = await completeDh(localDh.privateKey, publicKey);
              if (!current()) return;
              secretRef.current = secret;
              setPeerDh(publicKey);
              setSharedSecret(secret);
              setStatus("secure");
              setStatusText("DH 已完成，请核对两端会话指纹并确认算法");
              append({ direction: "system", text: "DH 交换完成 · 会话指纹 " + secret.slice(0, 12).toUpperCase() });
            } else if (data.type === "sm2-public") {
              setPeerSm2(data.publicKey as Sm2KeyPair["public"]);
            } else if (data.type === "algorithm-proposal") {
              const proposed = data.algorithm as AlgorithmId;
              if (role !== "decryptor" || !networkAlgorithms.some((item) => item.id === proposed)) throw new Error("无效的算法提议");
              negotiatedRef.current = null;
              setNegotiatedAlgorithm(null);
              setPendingAlgorithm(proposed);
              setSelectedAlgorithm(proposed);
              append({ direction: "system", text: "对端提议使用 " + algorithms.find((item) => item.id === proposed)?.name });
            } else if (data.type === "algorithm-accept") {
              const accepted = data.algorithm as AlgorithmId;
              if (role !== "encryptor" || accepted !== proposalRef.current) throw new Error("算法确认与当前提议不一致");
              negotiatedRef.current = accepted;
              setNegotiatedAlgorithm(accepted);
              setSelectedAlgorithm(accepted);
              append({ direction: "system", text: "算法协商完成：" + algorithms.find((item) => item.id === accepted)?.name });
            } else if (data.type === "chat") {
              const algorithm = data.algorithm as AlgorithmId;
              const sessionKey = secretRef.current;
              if (!sessionKey || algorithm !== negotiatedRef.current || !localSm2) throw new Error("消息尚未完成密钥/算法协商");
              const wirePayload = String(data.payload);
              const plain = algorithm === "sm2"
                ? sm2Decrypt(wirePayload, JSON.stringify(localSm2))
                : await processAlgorithm({ algorithm, mode: "decrypt", input: wirePayload, ...cipherKeys(algorithm, sessionKey) });
              if (!current()) return;
              append({ direction: "in", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: md5(plain) === data.digest, cipher: wirePayload });
            } else if (data.type === "file") {
              const sessionKey = secretRef.current;
              if (!sessionKey) throw new Error("尚未获得 DH 会话密钥");
              const bytes = await aesDecryptBytes(String(data.payload), sessionKey);
              if (!current()) return;
              const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: String(data.mime || "application/octet-stream") });
              const url = URL.createObjectURL(blob);
              fileUrlsRef.current.add(url);
              const received: ReceivedFile = { id: crypto.randomUUID(), sequence: nextSequence(), name: String(data.name || "received-file"), size: bytes.length, url, verified: md5(bytes) === data.digest, direction: "in" };
              setFiles((items) => [...items, received]);
            }
          }
        }).catch((reason) => { if (current()) setError(reason instanceof Error ? reason.message : "接收数据处理失败"); });
      };
      socket.onerror = () => fail("无法连接中继。请检查服务器地址、服务是否启动、局域网互通/浏览器本地网络权限及防火墙端口。");
      socket.onclose = () => {
        if (!current()) return;
        window.clearTimeout(connectTimerRef.current);
        socketRef.current = null;
        clearPeer();
        setServerId("");
        setStatus("offline");
        setStatusText("中继连接已关闭，请重新连接");
      };
    } catch (reason) {
      disconnect();
      const text = reason instanceof Error ? reason.message : "连接失败";
      setError(text);
      setStatus("error");
      setStatusText(text);
    }
  };

  const propose = () => {
    try {
      proposalRef.current = selectedAlgorithm;
      negotiatedRef.current = null;
      setNegotiatedAlgorithm(null);
      sendWire({ type: "algorithm-proposal", algorithm: selectedAlgorithm });
      append({ direction: "system", text: "已提议 " + algorithms.find((item) => item.id === selectedAlgorithm)?.name + "，等待对端确认" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "协商失败"); }
  };

  const accept = () => {
    if (!pendingAlgorithm) return;
    try {
      sendWire({ type: "algorithm-accept", algorithm: pendingAlgorithm });
      negotiatedRef.current = pendingAlgorithm;
      setNegotiatedAlgorithm(pendingAlgorithm);
      setPendingAlgorithm(null);
      append({ direction: "system", text: "已接受 " + algorithms.find((item) => item.id === pendingAlgorithm)?.name });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "协商失败"); }
  };

  const sendMessage = async () => {
    const algorithm = negotiatedRef.current;
    const sessionKey = secretRef.current;
    const socket = socketRef.current;
    if (role !== "encryptor" || !message.trim() || !algorithm || !sessionKey || !peerPresentRef.current) return;
    setSending(true);
    setError("");
    try {
      const plain = message;
      let payload: string;
      if (algorithm === "sm2") {
        if (!peerSm2) throw new Error("尚未收到对端 SM2 公钥");
        payload = sm2Encrypt(plain, JSON.stringify(peerSm2));
      } else {
        payload = await processAlgorithm({ algorithm, mode: "encrypt", input: plain, textEncoding: "utf8", ...cipherKeys(algorithm, sessionKey) });
      }
      if (socketRef.current !== socket || secretRef.current !== sessionKey || negotiatedRef.current !== algorithm) throw new Error("连接或算法已改变，请重新发送");
      sendWire({ type: "chat", algorithm, payload, digest: md5(plain), clientTag: crypto.randomUUID() });
      append({ direction: "out", text: plain, algorithm: algorithms.find((item) => item.id === algorithm)?.name, verified: true, cipher: payload });
      setMessage("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "消息发送失败"); }
    finally { setSending(false); }
  };

  const sendFile = async (file?: File) => {
    if (!file) return;
    const sessionKey = secretRef.current;
    const socket = socketRef.current;
    if (role !== "encryptor" || !sessionKey || !peerPresentRef.current) { setError("请先完成双机 DH 交换"); return; }
    if (file.size > 15 * 1024 * 1024) { setError("演示通道单个文件上限为 15 MB"); return; }
    setSending(true);
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const payload = await aesEncryptBytes(bytes, sessionKey);
      if (socketRef.current !== socket || secretRef.current !== sessionKey) throw new Error("连接已改变，请重新发送文件");
      sendWire({ type: "file", name: file.name, mime: file.type, size: file.size, payload, digest: md5(bytes), clientTag: crypto.randomUUID() });
      const url = URL.createObjectURL(file);
      fileUrlsRef.current.add(url);
      const sent: ReceivedFile = { id: crypto.randomUUID(), sequence: nextSequence(), name: file.name, size: file.size, url, verified: true, direction: "out" };
      setFiles((items) => [...items, sent]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "文件发送失败"); }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { setError("复制失败，请手动复制"); return false; }
  };
  const showShareFeedback = (action: "used" | "copied", url: string) => {
    window.clearTimeout(shareFeedbackTimerRef.current);
    setShareFeedback({ action, url });
    shareFeedbackTimerRef.current = window.setTimeout(() => setShareFeedback(null), 2200);
  };
  const editable = status === "offline" || status === "error";
  const isSecure = status === "secure" && Boolean(sharedSecret);
  const canSend = role === "encryptor" && isSecure && Boolean(negotiatedAlgorithm) && peerPresent && (negotiatedAlgorithm !== "sm2" || Boolean(peerSm2));
  const channelReady = isSecure && peerPresent && Boolean(negotiatedAlgorithm) && (negotiatedAlgorithm !== "sm2" || Boolean(peerSm2));
  const completedSteps = channelReady ? 4 : isSecure ? 3 : peerPresent ? 2 : status === "waiting" ? 1 : 0;
  const connectionSteps = ["连接中继", "对端加入", "密钥交换", "算法确认"];
  const connectionLabel = status === "error" ? "连接异常" : channelReady ? "通信已就绪" : isSecure ? "密钥已就绪" : status === "waiting" ? "等待连接完成" : status === "connecting" ? "正在连接" : "尚未连接";
  let relayPreview = "";
  try { relayPreview = buildRelayAddress(relayAddress, location.href); } catch { /* Show validation on connect; allow incomplete input while typing. */ }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(relayAddress.host.trim().toLowerCase());
  const timeline = [
    ...messages.map((item) => ({ kind: "message" as const, sequence: item.sequence, item })),
    ...files.map((item) => ({ kind: "file" as const, sequence: item.sequence, item })),
  ].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className="network-view app-panel panel-reveal grid h-full min-h-0 overflow-hidden rounded-[30px] lg:grid-cols-[315px_minmax(0,1fr)]">
      <aside className="panel-sidebar soft-scroll min-h-0 overflow-y-auto border-b border-white/10 p-5 lg:border-b-0 lg:border-r lg:p-6">
        <p className="eyebrow">SECURE LINK / 03</p>
        <h1 className="mt-2 text-3xl">双机安全通信</h1>
        <p className="mt-2 text-xs leading-5 text-white/45">统一程序 · WebSocket · DH · 消息与文件</p>

        <div className="mt-6">
          <span className="field-caption">选择本机角色</span>
          <div className="role-picker mt-2 grid grid-cols-2 gap-2">
            <button type="button" className={role === "encryptor" ? "is-active" : ""} onClick={() => editable && setRole("encryptor")} disabled={!editable}>
              <LockKeyhole />加密端
            </button>
            <button type="button" className={role === "decryptor" ? "is-active" : ""} onClick={() => editable && setRole("decryptor")} disabled={!editable}>
              <FileDown />解密端
            </button>
          </div>
        </div>

        <div className={`network-role-guide is-${role}`} aria-live="polite">
          <strong>{role === "encryptor" ? "发送方 · 配置并分享连接信息" : "接收方 · 填写发送方提供的信息"}</strong>
          <p>{role === "encryptor" ? "推荐由这台加密端电脑运行中继。选好本机 IP 后，把 IP、端口和房间码发给解密端；连接后发起算法协商并发送消息。" : "推荐连接加密端电脑上的中继。向对方索取 IP、端口和房间码；连接后接受算法，消息会自动解密并显示在右侧。"}</p>
        </div>

        <div className="network-address-fields mt-5" data-agent-id="network.relay">
          <label className="field-label">
            <span>中继主机 IP / 域名</span>
            <input aria-label="中继主机 IP 或域名" aria-describedby="network-address-help" className="field-control font-mono" value={relayAddress.host} onChange={(event) => setRelayAddress((current) => ({ ...current, host: event.target.value }))} disabled={!editable} placeholder="例如 192.168.1.10" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field-label">
            <span>端口号</span>
            <input aria-label="中继端口号" aria-describedby="network-port-help" className="field-control font-mono" value={relayAddress.port} onChange={(event) => setRelayAddress((current) => ({ ...current, port: event.target.value }))} disabled={!editable} inputMode="numeric" maxLength={5} placeholder="5173" />
          </label>
        </div>
        <p id="network-address-help" className="network-relay-hint mt-2 text-xs leading-5 text-white/50">
          {role === "encryptor" ? <>本机运行中继时，填<strong>这台加密端电脑的局域网 IP</strong>，可从下方选择。让解密端填写相同的 IP。</> : <>填<strong>加密端电脑的局域网 IP</strong>，不是这台解密端电脑的 IP。请让加密端从“查看并分享本机 IP”中提供地址。</>}
        </p>
        <p id="network-port-help" className="network-port-hint">端口填中继主机实际运行的端口（开发环境通常为 5173），两端一致。这里修改端口只改变连接目标，不会启动新服务。</p>
        {isLoopback && <p className="network-loopback-note">当前地址仅指向本机：单台电脑开两个窗口测试可以使用；两台电脑测试请改为中继主机的局域网 IP。</p>}

        {role === "encryptor" ? (
          <details className="network-relay-help mt-2 text-xs leading-5 text-white/50">
            <summary className="cursor-pointer">查看并分享本机 IP（推荐加密端运行中继）</summary>
            <p className="mt-2">本地运行项目时，下列为这台主机的可用地址。选择与解密端处于同一局域网的 IP，保持项目运行，并允许 Node.js 通过专用网络防火墙。</p>
            {lanUrls.map((url) => {
              const address = splitRelayAddress(url, "http://localhost");
              return <div className="network-share-address" key={url}>
                <code>IP：{address.host}<br />端口：{address.port}</code>
                <div>
                  <button type="button" className={shareFeedback?.action === "used" && shareFeedback.url === url ? "is-success" : ""} disabled={!editable || location.protocol === "https:"} onClick={() => { setRelayAddress(address); showShareFeedback("used", url); }}>{shareFeedback?.action === "used" && shareFeedback.url === url ? <><Check />已使用</> : "使用此地址"}</button>
                  <button type="button" className={shareFeedback?.action === "copied" && shareFeedback.url === url ? "is-success" : ""} onClick={async () => { if (await copyText(`中继 IP：${address.host}\n端口：${address.port}\n协议：${address.protocol}\n路径：${address.path}\n房间码：${room}\n请选择解密端，并填写以上信息。`)) showShareFeedback("copied", url); }}>{shareFeedback?.action === "copied" && shareFeedback.url === url ? <><Check />已复制</> : "复制给解密端"}</button>
                </div>
                {shareFeedback?.url === url && <p className="network-action-feedback" role="status">{shareFeedback.action === "used" ? "已将这组 IP 和端口填入连接设置" : "连接信息与房间码已复制，可发送给解密端"}</p>}
              </div>;
            })}
            {!lanUrls.length && <p className="mt-2">暂未发现局域网地址，请检查主机网络；也可以在主机运行 ipconfig，查看当前网络的 IPv4 地址。</p>}
            {location.protocol === "https:" && <p className="mt-2">当前为 HTTPS 页面，请使用下方高级设置中的公共 WSS 中继；本地 WS 调试请打开 http://localhost 页面。</p>}
          </details>
        ) : (
          <details className="network-relay-help mt-2 text-xs leading-5 text-white/50">
            <summary className="cursor-pointer">解密端怎么填写？查看示例</summary>
            <p className="mt-2">假设加密端提供 IP 192.168.1.10、端口 5173，你就在上方分别填写这两个值，再把下面的房间码改成对方提供的房间码。</p>
            <p className="mt-2">这里不需要查找或分享本机 IP。连接后等待加密端提议算法，点击“接受该算法”，即可接收消息和文件。</p>
          </details>
        )}
        <details className="network-relay-help network-relay-advanced mt-2 text-xs leading-5 text-white/50">
          <summary className="cursor-pointer">高级设置 · 公共中继 / 协议</summary>
          <p className="mt-2">加密 / 解密角色不决定谁运行中继。若约定使用解密端电脑或公共服务器作为中继，两端都填那台中继主机的 IP / 域名与端口。</p>
          <div className="network-address-fields mt-2">
            <label className="field-label"><span>协议</span><select aria-label="中继协议" className="field-control" value={relayAddress.protocol} onChange={(event) => setRelayAddress((current) => ({ ...current, protocol: event.target.value as "ws" | "wss" }))} disabled={!editable}><option value="ws">WS（本地）</option><option value="wss">WSS（加密）</option></select></label>
            <label className="field-label"><span>服务路径</span><input aria-label="中继服务路径" className="field-control" value={relayAddress.path} onChange={(event) => setRelayAddress((current) => ({ ...current, path: event.target.value }))} disabled={!editable} /></label>
          </div>
          <p className="mt-2">跨网络需使用双方可访问的中继。HTTPS 页面必须选择 WSS，端口通常为 443；切换协议后请核对端口。</p>
          <code className="network-relay-preview">{relayPreview || "请填写有效的 IP、端口及路径"}</code>
        </details>

        <label className="field-label mt-5">
          <span>ROOM CODE / 房间码</span>
          <div className="relative">
            <input aria-label="房间码" data-agent-id="network.room" maxLength={18} className="field-control pr-10 font-mono uppercase tracking-wider" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase())} disabled={!editable} />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/45 hover:text-white" type="button" onClick={() => void copyText(room)} title="复制房间码"><Clipboard className="h-4 w-4" /></button>
          </div>
        </label>

        <p className="network-port-hint">{role === "encryptor" ? "将此房间码发给解密端，两端进入同一个房间。" : "请填写加密端提供的房间码，不要保留各自随机生成的不同房间码。"}</p>

        <button className={`mt-3 w-full ${status === "offline" || status === "error" ? "primary-button" : "secondary-button"}`} data-agent-id="network.connect" type="button" onClick={status === "offline" || status === "error" ? connect : disconnect}>
          {status === "connecting" ? <LoaderCircle className="animate-spin" /> : status === "offline" || status === "error" ? <Link /> : <Unplug />}
          {status === "offline" || status === "error" ? "连接安全房间" : status === "connecting" ? "连接中…" : "断开连接"}
        </button>

        <div className={`connection-status mt-4 is-${status}`}>
          <span className="connection-orb" />
          <div><strong>{connectionLabel}</strong><p>{channelReady ? "密钥交换与算法协商已完成，可以开始加密通信" : statusText}</p></div>
        </div>
        {serverId && <p className="mt-2 text-xs leading-5 text-white/45">中继服务标识（两端应一致）：<code data-testid="relay-server-id" className="block break-all text-emerald-100/70">{serverId}</code></p>}

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="field-caption">{role === "encryptor" ? "选择并提议算法" : "确认发送方的算法"}</span>
            {negotiatedAlgorithm && <span className="verified-chip"><Check />已确认</span>}
          </div>
          <select aria-label="通信算法" className="field-control" value={selectedAlgorithm} onChange={(event) => setSelectedAlgorithm(event.target.value as AlgorithmId)} disabled={role === "decryptor"}>
            {networkAlgorithms.map((item) => <option key={item.id} value={item.id}>{item.family} · {item.name}</option>)}
          </select>
          {role === "encryptor" ? (
            <button className="mini-wide-button mt-2 w-full" type="button" onClick={propose} disabled={!peerPresent}>向对端发起协商</button>
          ) : pendingAlgorithm ? (
            <button className="primary-button mt-2 w-full" type="button" onClick={accept} disabled={!isSecure}><Check />接受该算法</button>
          ) : (
            <p className="mt-2 text-xs leading-5 text-white/35">{negotiatedAlgorithm ? "算法已确认，正在监听加密消息" : "等待加密端发起算法协商"}</p>
          )}
        </div>

        <div className="network-diagnostics mt-6 space-y-2 text-xs text-white/40">
          <div className="flex items-center justify-between"><span>{role === "encryptor" ? "解密端连接" : "加密端连接"}</span><b className={peerPresent ? "text-emerald-200" : "text-white/35"}>{peerPresent ? "ONLINE" : "WAITING"}</b></div>
          <div className="flex items-center justify-between"><span>DH 公钥</span><b className={peerDh ? "text-emerald-200" : "text-white/35"}>{peerDh ? "RECEIVED" : "PENDING"}</b></div>
          <div className="flex items-center justify-between"><span>会话指纹</span><b className="font-mono text-white/60">{sharedSecret ? sharedSecret.slice(0, 10).toUpperCase() : "—"}</b></div>
        </div>
      </aside>

      <section className="network-console flex min-h-0 flex-col p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{role === "encryptor" ? "ENCRYPTOR CONSOLE" : "DECRYPTOR CONSOLE"}</p>
            <h2 className="mt-1 text-2xl sm:text-3xl">{role === "encryptor" ? "加密发送控制台" : "实时解密接收台"}</h2>
          </div>
          <div className={`secure-seal ${isSecure ? "is-ready" : ""}`}><ShieldCheck /><span>{isSecure ? "端到端密钥就绪" : "等待 DH 交换"}</span></div>
        </header>

        <div className={`network-progress is-${status}`}>
          <div className="network-progress-heading" aria-live="polite">
            <span><span className="network-live-dot" />安全连接进度</span>
            <strong>{status === "error" ? "请检查连接" : `${completedSteps} / 4 步骤已完成`}</strong>
          </div>
          <div className="network-progress-track" role="progressbar" aria-label="安全连接进度" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completedSteps} aria-valuetext={`${connectionLabel}，${completedSteps} / 4 步骤已完成`}>
            <span style={{ width: `${completedSteps * 25}%` }} />
          </div>
          <ol className="network-progress-steps">
            {connectionSteps.map((label, index) => (
              <li key={label} className={index < completedSteps ? "is-complete" : index === completedSteps && !editable ? "is-current" : ""} aria-current={index === completedSteps && !editable ? "step" : undefined}>
                <span>{index < completedSteps ? <Check aria-hidden="true" /> : index + 1}</span>{label}
              </li>
            ))}
          </ol>
        </div>

        <div className="network-log-heading"><span>通信记录</span><span>{messages.filter((item) => item.direction !== "system").length} 条消息 · {files.length} 个文件</span></div>
        <div ref={logRef} className="message-stage soft-scroll min-h-[220px] flex-1 overflow-y-auto rounded-[26px] p-4 sm:p-5">
          {!messages.length && !files.length && (
            <div className="grid h-full min-h-44 place-items-center text-center">
              <div><Radio className="mx-auto h-7 w-7 text-white/25" /><p className="mt-3 text-sm text-white/35">连接另一台设备后，通信记录会出现在这里</p></div>
            </div>
          )}
          <div className="network-timeline space-y-3">
            {timeline.map((entry) => {
              if (entry.kind === "message") {
                const item = entry.item;
                return item.direction === "system" ? (
                  <div className="system-message" key={item.id}><span>{item.time}</span><p>{item.text}</p></div>
                ) : (
                  <div className={`chat-row ${item.direction === "out" ? "is-out" : "is-in"}`} key={item.id}>
                    <div className="chat-bubble">
                      {item.cipher && <CipherBlock cipher={item.cipher} outbound={item.direction === "out"} onCopy={(text) => void copyText(text)} />}
                      <p className="whitespace-pre-wrap break-words">{item.text}</p>
                      <div><span>{item.algorithm}</span><span>{item.time}</span>{item.verified !== undefined && <span className={item.verified ? "text-emerald-200" : "text-amber-200"}>{item.verified ? "MD5 ✓" : "MD5 !"}</span>}</div>
                    </div>
                  </div>
                );
              }
              const file = entry.item;
              return <a className={`file-card is-${file.direction}`} href={file.url} download={file.name} key={file.id}>
                <span className="file-icon">{file.direction === "out" ? <FileUp /> : <File />}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate">{file.direction === "out" ? "已发送 · " : "已接收 · "}{file.name}</strong><small>{formatBytes(file.size)} · AES-256-GCM 加密文件通道</small></span>
                <span className={file.verified ? "verified-chip" : "warning-chip"}>{file.verified ? <Check /> : "!"}{file.direction === "out" ? "MD5 已生成" : file.verified ? "MD5 已验证" : "校验失败"}</span>
                <FileDown className="h-5 w-5" aria-label="下载文件" />
              </a>;
            })}
          </div>
        </div>

        {error && <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-100">{error}</div>}

        <div className="composer mt-3 rounded-[24px] p-2.5">
          <textarea
            className="soft-scroll h-16 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/25"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={role === "decryptor" ? "解密端正在监听加密消息…" : canSend ? "输入需要加密发送的消息…" : "完成连接、DH 与算法协商后即可发送"}
            disabled={!canSend || sending}
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="network-composer-hint flex items-center gap-2 text-[11px] text-white/35">
              <span className="hidden sm:inline">消息：协商算法</span><span>文件：AES-256-GCM</span>
            </div>
            <div className="flex gap-2">
              <input ref={fileRef} className="hidden" type="file" onChange={(event) => void sendFile(event.target.files?.[0])} />
              <button className="secondary-button !px-3" type="button" onClick={() => fileRef.current?.click()} disabled={role !== "encryptor" || !isSecure || sending} title="发送文件"><FileUp /><span className="hidden sm:inline">文件</span></button>
              <button className="send-button" type="button" onClick={() => void sendMessage()} disabled={!canSend || !message.trim() || sending}>
                {sending ? <LoaderCircle className="animate-spin" /> : <Send />}<span>加密发送</span><ArrowUp />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
