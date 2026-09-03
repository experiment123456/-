import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bot,
  BrainCircuit,
  CircleStop,
  Compass,
  GripHorizontal,
  History,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

export type AgentNavigateTarget = "home" | "workbench" | "dh" | "network" | "catalog" | "innovation" | "agent";
type AgentMode = "studio" | "dock" | "hidden";
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ProtocolMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};
type DisplayMessage = { id: string; role: "user" | "assistant" | "system"; content: string };
type ConversationSummary = { id: string; title: string; preview: string; createdAt: string; updatedAt: string; messageCount: number };
type StoredConversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: ProtocolMessage[] };
type DockRect = { x: number; y: number; width: number; height: number };
type OrbPosition = { x: number; y: number };
type AgentExecution = { toolSteps: number; signatures: Map<string, number> };
type StreamEvent =
  | { type: "meta"; configured: boolean; model: string }
  | { type: "delta"; text: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "usage"; usage: unknown }
  | { type: "error"; error: string }
  | { type: "done" };

type AgentExperienceProps = {
  mode: AgentMode;
  userId?: string;
  userName?: string;
  onNavigate: (target: AgentNavigateTarget) => void;
};

const quickPrompts = ["带我演示 AES", "讲解 DH 密钥交换", "如何使用双机通信", "查看全部算法"];
const navigationTargets = new Set<AgentNavigateTarget>(["home", "workbench", "dh", "network", "catalog", "innovation", "agent"]);
const safeActivations = new Set(["workbench.algorithm.aes", "workbench.sample", "workbench.generate-key", "workbench.run", "dh.reveal", "dh.regenerate", "dh.exchange"]);

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const dockStorageKey = "lumora-agent-dock-layout-v1";
const orbStorageKey = "lumora-agent-orb-position-v1";
const orbSize = 58;
const maxToolSteps = 20;

function clampDockRect(rect: DockRect): DockRect {
  const margin = 10;
  const width = Math.min(Math.max(rect.width, 380), Math.max(380, window.innerWidth - margin * 2));
  const height = Math.min(Math.max(rect.height, 460), Math.max(460, window.innerHeight - margin * 2));
  return {
    x: Math.min(Math.max(rect.x, margin), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(rect.y, margin), Math.max(margin, window.innerHeight - height - margin)),
    width,
    height,
  };
}

function initialDockRect(): DockRect {
  const fallback = {
    width: Math.min(440, window.innerWidth - 20),
    height: Math.min(650, window.innerHeight - 20),
    x: Math.max(10, window.innerWidth - Math.min(440, window.innerWidth - 20) - 18),
    y: Math.max(10, window.innerHeight - Math.min(650, window.innerHeight - 20) - 18),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(dockStorageKey) || "null") as Partial<DockRect> | null;
    if (saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return clampDockRect(saved as DockRect);
  } catch { /* Ignore an invalid local layout and use the safe desktop default. */ }
  return clampDockRect(fallback);
}

function clampOrbPosition(position: OrbPosition): OrbPosition {
  const margin = 10;
  return {
    x: Math.min(Math.max(position.x, margin), Math.max(margin, window.innerWidth - orbSize - margin)),
    y: Math.min(Math.max(position.y, margin), Math.max(margin, window.innerHeight - orbSize - margin)),
  };
}

function initialOrbPosition(): OrbPosition {
  const fallback = { x: window.innerWidth - orbSize - 20, y: window.innerHeight - orbSize - 20 };
  try {
    const saved = JSON.parse(localStorage.getItem(orbStorageKey) || "null") as Partial<OrbPosition> | null;
    if (saved && [saved.x, saved.y].every(Number.isFinite)) return clampOrbPosition(saved as OrbPosition);
  } catch { /* Ignore invalid saved coordinates. */ }
  return clampOrbPosition(fallback);
}

function currentUiState() {
  const view = location.hash.replace(/^#\/?/, "") || "home";
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.agentId || "" : "";
  return { view, focused, viewport: innerWidth < 640 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop" };
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function findAgentElement(target: string) {
  return document.querySelector<HTMLElement>(`[data-agent-id="${target}"]`);
}

async function waitForAgentElement(target: string, timeout = 4_000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const element = findAgentElement(target);
    if (element) return element;
    await sleep(80);
  }
  return null;
}

async function waitForAgentValue(target: string, timeout = 4_000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const element = findAgentElement(target);
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.value) return true;
    await sleep(80);
  }
  return false;
}

export default function AgentExperience({ mode, userId, userName, onNavigate }: AgentExperienceProps) {
  const [activated, setActivated] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("检测中");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [usingAgent, setUsingAgent] = useState(false);
  const [sourceAtEnd, setSourceAtEnd] = useState(false);
  const [guide, setGuide] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [dockRect, setDockRect] = useState<DockRect>(initialDockRect);
  const [orbPosition, setOrbPosition] = useState<OrbPosition>(initialOrbPosition);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { id: "welcome", role: "assistant", content: "你好，我是 Lumora AI 密码学导师。你可以直接提问，也可以让我带你操作 AES、DH、双机通信和算法档案。" },
  ]);
  const protocolRef = useRef<ProtocolMessage[]>([]);
  const requestRef = useRef(0);
  const highlightRef = useRef<HTMLElement | null>(null);
  const guideTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const sourceFrameRef = useRef<HTMLIFrameElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const orbDraggedRef = useRef(false);
  const activeConversationRef = useRef<string | null>(null);
  const activeConversationTitleRef = useRef("新对话");
  const accountRef = useRef(userId);

  const refreshConversationHistory = async () => {
    const response = await fetch("/api/agent/conversations", { credentials: "same-origin" });
    if (!response.ok) {
      setConversations([]);
      return;
    }
    const payload = await response.json() as { conversations?: ConversationSummary[] };
    setConversations(payload.conversations || []);
  };

  const createConversation = async (title: string) => {
    const response = await fetch("/api/agent/conversations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const payload = await response.json() as { conversation?: StoredConversation; error?: string };
    if (!response.ok || !payload.conversation) throw new Error(payload.error || "无法创建新对话");
    activeConversationRef.current = payload.conversation.id;
    activeConversationTitleRef.current = payload.conversation.title;
    return payload.conversation.id;
  };

  const persistConversation = async (conversationId: string, messagesToSave: ProtocolMessage[]) => {
    const response = await fetch(`/api/agent/conversations/${conversationId}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: activeConversationTitleRef.current, messages: messagesToSave }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "历史对话保存失败");
    }
    await refreshConversationHistory();
  };

  useEffect(() => {
    if (mode === "studio") {
      setActivated(true);
      setMinimized(false);
    }
  }, [mode]);

  useEffect(() => {
    const receiveFrameAction = (event: MessageEvent) => {
      if (event.source !== sourceFrameRef.current?.contentWindow) return;
      if (event.data?.type === "lumora:open-agent") setUsingAgent(true);
      if (event.data?.type === "lumora:source-end") setSourceAtEnd(Boolean(event.data.atEnd));
    };
    window.addEventListener("message", receiveFrameAction);
    return () => window.removeEventListener("message", receiveFrameAction);
  }, []);

  useEffect(() => {
    if (mode === "hidden" || (mode === "dock" && !activated)) return;
    void fetch("/api/agent/status", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ configured: boolean; model: string }>;
      })
      .then((status) => { setConfigured(status.configured); setModel(status.configured ? status.model : "本地演示模式"); })
      .catch(() => { setConfigured(null); setModel("登录后可用"); });
  }, [activated, mode]);

  useEffect(() => {
    if (mode === "hidden" || (mode === "dock" && !activated)) return;
    void refreshConversationHistory();
  }, [activated, mode, userId]);

  useEffect(() => {
    if (accountRef.current === userId) return;
    accountRef.current = userId;
    requestRef.current += 1;
    activeConversationRef.current = null;
    activeConversationTitleRef.current = "新对话";
    protocolRef.current = [];
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "你好，我是 Lumora AI 密码学导师。你可以开启新对话，或从历史归档中继续之前的学习。" }]);
    setConversations([]);
    setHistoryOpen(false);
  }, [userId]);

  useEffect(() => {
    const keepFloatingUiVisible = () => {
      setDockRect((current) => clampDockRect(current));
      setOrbPosition((current) => clampOrbPosition(current));
    };
    window.addEventListener("resize", keepFloatingUiVisible);
    return () => window.removeEventListener("resize", keepFloatingUiVisible);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => () => {
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    highlightRef.current?.classList.remove("agent-highlight-target");
  }, []);

  const showGuide = async (target: string, label: string, duration = 2_800) => {
    const element = await waitForAgentElement(target);
    if (!element) return false;
    highlightRef.current?.classList.remove("agent-highlight-target");
    highlightRef.current = element;
    element.classList.add("agent-highlight-target");
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setGuide(label);
    if (guideTimerRef.current) window.clearTimeout(guideTimerRef.current);
    guideTimerRef.current = window.setTimeout(() => {
      element.classList.remove("agent-highlight-target");
      if (highlightRef.current === element) highlightRef.current = null;
      setGuide("");
    }, duration);
    return true;
  };

  const navigateAndWait = async (target: AgentNavigateTarget, waitTarget?: string) => {
    onNavigate(target);
    await sleep(180);
    if (waitTarget) await waitForAgentElement(waitTarget);
  };

  const clickControl = async (target: string) => {
    const element = await waitForAgentElement(target);
    if (!(element instanceof HTMLButtonElement)) return false;
    element.click();
    return true;
  };

  const fillWorkbenchInput = async (text: string) => {
    const element = await waitForAgentElement("workbench.input");
    if (!(element instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(element, text.slice(0, 500));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };

  const runTour = async (topic: string) => {
    if (topic === "platform") {
      await navigateAndWait("home", "nav.innovation");
      await showGuide("nav.innovation", "这里是 AI 创新入口，进入后可以随时召唤我。", 3_200);
      return "已打开首页并高亮 AI 创新入口";
    }
    if (topic === "aes") {
      await navigateAndWait("workbench", "workbench.algorithm.aes");
      await clickControl("workbench.algorithm.aes");
      await fillWorkbenchInput("Lumora Agent 教学示例：AES-GCM 同时保护机密性与完整性。🔐");
      await showGuide("workbench.input", "这是明文输入区，我已经填入不含敏感信息的教学示例。", 2_000);
      await sleep(850);
      await showGuide("workbench.key", "这里是 AES 密钥材料。真实使用时不要向任何 AI 发送密钥。", 2_000);
      await sleep(850);
      await clickControl("workbench.run");
      const generated = await waitForAgentValue("workbench.output");
      await showGuide("workbench.output", "加密结果已经生成；AES-GCM 还会验证内容是否被篡改。", 3_400);
      return generated ? "已完成 AES 教学示例、执行加密并高亮结果" : "已执行 AES 教学示例，但结果区尚未完成更新";
    }
    if (topic === "dh") {
      await navigateAndWait("dh", "dh.alice");
      await showGuide("dh.alice", "Alice 在本地保存私钥，只公开公钥。", 1_900);
      await sleep(900);
      await showGuide("dh.bob", "Bob 同样独立生成密钥对，双方不传输私钥。", 1_900);
      await sleep(900);
      await clickControl("dh.exchange");
      await showGuide("dh.exchange", "双方使用对方公钥推导出相同的共享密钥。", 3_400);
      return "已打开 DH 页面并完成一次本地公钥交换演示";
    }
    if (topic === "network") {
      await navigateAndWait("network", "network.relay");
      await showGuide("network.relay", "两台设备必须填写同一个可访问的 WebSocket 中继地址。", 2_300);
      await sleep(900);
      await showGuide("network.room", "双方还需要输入相同房间码。Agent 不会替你自动联网。", 3_200);
      await sleep(900);
      await showGuide("network.connect", "配置完成后，两端分别选择相反角色并点击连接；第二台设备加入后会自动执行 DH 密钥交换。", 3_600);
      return "双机通信教学引导已完成：已依次说明中继地址、房间码和连接入口。真实端到端连接需要第二台设备使用相同中继与房间码，并选择相反角色";
    }
    await navigateAndWait("catalog", "catalog.grid");
    await showGuide("catalog.grid", "这里集中展示 Lumora 支持的密码与摘要算法。", 3_200);
    return "已打开算法档案并高亮算法卡片列表";
  };

  const executeTool = async (call: ToolCall) => {
    let args: Record<string, string> = {};
    try { args = JSON.parse(call.function.arguments || "{}"); }
    catch { return "工具参数不是有效 JSON，未执行"; }
    switch (call.function.name) {
      case "navigate_to":
        if (!navigationTargets.has(args.target as AgentNavigateTarget)) return `拒绝未知页面：${args.target}`;
        await navigateAndWait(args.target as AgentNavigateTarget);
        return `已打开 ${args.target} 页面`;
      case "highlight_control":
        return await showGuide(args.target, args.label) ? `已高亮 ${args.target}` : `没有找到 ${args.target}`;
      case "activate_control":
        if (!safeActivations.has(args.target)) return `拒绝非白名单控件：${args.target}`;
        return await clickControl(args.target) ? `已安全点击 ${args.target}` : `没有找到或不允许点击 ${args.target}`;
      case "fill_example_text":
        if (location.hash !== "#workbench") await navigateAndWait("workbench", "workbench.input");
        return await fillWorkbenchInput(args.text || "") ? "已填写非敏感教学示例" : "未找到单机实验输入区";
      case "start_guided_tour":
        return await runTour(args.topic);
      default:
        return `拒绝未知工具：${call.function.name}`;
    }
  };

  const appendAgentCompletion = (content: string, protocol: ProtocolMessage[]) => {
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content }]);
    protocolRef.current = [...protocol, { role: "assistant", content }];
  };

  const runAgent = async (
    protocol: ProtocolMessage[],
    execution: AgentExecution = { toolSteps: 0, signatures: new Map() },
  ): Promise<void> => {
    const request = ++requestRef.current;
    const assistantId = crypto.randomUUID();
    let assistantText = "";
    let calls: ToolCall[] = [];
    setMessages((items) => [...items, { id: assistantId, role: "assistant", content: "" }]);
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: protocol, uiState: currentUiState() }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "无法连接 Lumora Agent");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      let appended = "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "delta") appended += event.text;
        else if (event.type === "tool_calls") calls = event.calls;
        else if (event.type === "meta") { setConfigured(event.configured); setModel(event.model); }
        else if (event.type === "error") throw new Error(event.error);
      }
      if (appended && request === requestRef.current) {
        assistantText += appended;
        const visible = assistantText;
        setMessages((items) => items.map((item) => item.id === assistantId ? { ...item, content: visible } : item));
      }
      if (done) break;
    }
    if (!assistantText && calls.length) {
      setMessages((items) => items.filter((item) => item.id !== assistantId));
    }
    const assistantProtocol: ProtocolMessage = { role: "assistant", content: assistantText, ...(calls.length ? { tool_calls: calls } : {}) };
    let next = [...protocol, assistantProtocol];
    protocolRef.current = next;
    if (!calls.length) return;

    setGuide("Agent 正在执行完整的站内演示…");
    const results: string[] = [];
    let repeatedOperation = false;
    for (const call of calls) {
      const signature = `${call.function.name}:${call.function.arguments}`;
      const count = (execution.signatures.get(signature) || 0) + 1;
      execution.signatures.set(signature, count);
      if (count > 2) repeatedOperation = true;
      const result = count > 2 ? "该步骤已经执行完成，无需重复操作" : await executeTool(call);
      results.push(result);
      next = [...next, { role: "tool", content: result, tool_call_id: call.id }];
    }
    protocolRef.current = next;
    execution.toolSteps += calls.length;

    if (calls.some((call) => call.function.name === "start_guided_tour")) {
      appendAgentCompletion(`演示已完成。${results.join("；")}。你可以停留在当前页面继续操作或向我提问。`, next);
      return;
    }
    if (repeatedOperation) {
      appendAgentCompletion("本轮操作已经完成。为避免重复点击同一控件，我已保留当前页面状态，你可以继续操作或提出下一步要求。", next);
      return;
    }
    if (execution.toolSteps >= maxToolSteps) {
      appendAgentCompletion(`本轮可执行的页面操作已经完成。${results.at(-1) || "当前页面已就绪"}。`, next);
      return;
    }
    await runAgent(next, execution);
  };

  const openConversation = async (conversationId: string) => {
    if (busy) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/agent/conversations/${conversationId}`, { credentials: "same-origin" });
      const payload = await response.json() as { conversation?: StoredConversation; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error || "无法打开历史对话");
      requestRef.current += 1;
      activeConversationRef.current = payload.conversation.id;
      activeConversationTitleRef.current = payload.conversation.title;
      protocolRef.current = payload.conversation.messages;
      const restored = payload.conversation.messages
        .filter((message) => (message.role === "user" || message.role === "assistant") && message.content)
        .map<DisplayMessage>((message) => ({ id: crypto.randomUUID(), role: message.role as "user" | "assistant", content: message.content }));
      setMessages(restored.length ? restored : [{ id: crypto.randomUUID(), role: "assistant", content: "这段对话还没有内容。你可以从这里继续提问。" }]);
      setHistoryOpen(false);
      setGuide("");
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : "无法打开历史对话" }]);
    } finally {
      setHistoryBusy(false);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (busy) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(`/api/agent/conversations/${conversationId}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("无法删除历史对话");
      if (activeConversationRef.current === conversationId) reset();
      await refreshConversationHistory();
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : "无法删除历史对话" }]);
    } finally {
      setHistoryBusy(false);
    }
  };

  const startDockInteraction = (event: ReactPointerEvent, kind: "move" | "resize") => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...dockRect };
    let latest = dockRect;
    const move = (pointer: PointerEvent) => {
      const deltaX = pointer.clientX - start.pointerX;
      const deltaY = pointer.clientY - start.pointerY;
      if (kind === "move") {
        latest = clampDockRect({ ...dockRect, x: start.x + deltaX, y: start.y + deltaY });
      } else {
        latest = clampDockRect({
          ...dockRect,
          width: Math.min(Math.max(380, start.width + deltaX), window.innerWidth - start.x - 10),
          height: Math.min(Math.max(460, start.height + deltaY), window.innerHeight - start.y - 10),
        });
      }
      setDockRect(latest);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      localStorage.setItem(dockStorageKey, JSON.stringify(latest));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const startOrbInteraction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...orbPosition };
    let latest = orbPosition;
    let moved = false;
    const move = (pointer: PointerEvent) => {
      const deltaX = pointer.clientX - start.pointerX;
      const deltaY = pointer.clientY - start.pointerY;
      if (Math.hypot(deltaX, deltaY) > 4) moved = true;
      latest = clampOrbPosition({ x: start.x + deltaX, y: start.y + deltaY });
      setOrbPosition(latest);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      orbDraggedRef.current = moved;
      localStorage.setItem(orbStorageKey, JSON.stringify(latest));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setActivated(true);
    setMinimized(false);
    setDraft("");
    setBusy(true);
    let conversationId = activeConversationRef.current;
    const next: ProtocolMessage[] = [...protocolRef.current, { role: "user", content }];
    protocolRef.current = next;
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", content }]);
    try {
      if (!conversationId) {
        const title = content.replace(/\s+/g, " ").slice(0, 30) || "新对话";
        conversationId = await createConversation(title);
      }
      await runAgent(next);
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : "Agent 执行失败" }]);
    } finally {
      if (conversationId) {
        try {
          await persistConversation(conversationId, protocolRef.current);
        } catch (error) {
          setMessages((items) => [...items, { id: crypto.randomUUID(), role: "system", content: error instanceof Error ? error.message : "历史对话保存失败" }]);
        }
      }
      setBusy(false);
      setGuide("");
    }
  };

  const reset = () => {
    requestRef.current += 1;
    protocolRef.current = [];
    activeConversationRef.current = null;
    activeConversationTitleRef.current = "新对话";
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "新会话已开始。你想学习哪个算法，或者需要我带你操作哪个页面？" }]);
    setBusy(false);
    setGuide("");
    setHistoryOpen(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const chat = (
    <section className="agent-chat-panel" aria-label="Lumora AI 对话">
      <header className="agent-chat-head">
        <span className="agent-status-orb"><Bot /></span>
        <span><b>千问 · 密码学导师</b><small><i className={configured ? "is-online" : ""} />{model}</small></span>
        <button className={historyOpen ? "is-active" : ""} type="button" onClick={() => setHistoryOpen((open) => !open)} title="历史对话" aria-label="打开历史对话" disabled={busy}><History /></button>
        <button type="button" onClick={reset} title="开启新对话" aria-label="开启新对话" disabled={busy}><Plus /></button>
      </header>
      {historyOpen && (
        <aside className="agent-history" aria-label="历史对话归档">
          <header><span><History />旧对话</span><button type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭历史对话"><X /></button></header>
          <div className="agent-history-list">
            {historyBusy && !conversations.length && <p className="agent-history-empty">正在读取历史对话…</p>}
            {!historyBusy && !conversations.length && <p className="agent-history-empty">还没有旧对话。发送第一条消息后会自动归档。</p>}
            {conversations.map((conversation) => (
              <article className={activeConversationRef.current === conversation.id ? "is-active" : ""} key={conversation.id}>
                <button type="button" onClick={() => void openConversation(conversation.id)} disabled={historyBusy || busy}>
                  <b>{conversation.title}</b>
                  <p>{conversation.preview}</p>
                  <small>{formatConversationTime(conversation.updatedAt)} · {conversation.messageCount} 条消息</small>
                </button>
                <button className="agent-history-delete" type="button" onClick={() => void deleteConversation(conversation.id)} disabled={historyBusy || busy} title="删除这段对话" aria-label={`删除对话：${conversation.title}`}><Trash2 /></button>
              </article>
            ))}
          </div>
          <button className="agent-history-new" type="button" onClick={reset} disabled={busy}><Plus />开启新对话</button>
        </aside>
      )}
      <div className="agent-chat-log" ref={logRef} aria-live="polite">
        {messages.map((message) => (
          <div className={`agent-message is-${message.role}`} key={message.id}>
            {message.role === "assistant" && <Bot />}
            <p>{message.content || (busy ? "正在思考…" : "")}</p>
          </div>
        ))}
        {guide && <div className="agent-action-line"><Radio />{guide}</div>}
      </div>
      <div className="agent-quick-prompts">
        {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)} disabled={busy}>{prompt}</button>)}
      </div>
      <form className="agent-composer" onSubmit={submit}>
        <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!busy) void send(draft); }
        }} placeholder="问算法原理，或说“带我演示 AES”…" maxLength={4_000} />
        <button type="submit" disabled={busy || !draft.trim()} aria-label={busy ? "Agent 正在响应" : "发送消息"}>{busy ? <CircleStop /> : <ArrowUp />}</button>
      </form>
      <footer><ShieldCheck />Agent 只能调用经过白名单验证的站内工具；请勿输入真实密码或私钥。</footer>
    </section>
  );

  if (mode === "hidden" || (mode === "dock" && !activated)) return null;
  if (mode === "dock") {
    if (minimized) {
      return (
        <button
          className="agent-dock-orb"
          type="button"
          style={{ left: orbPosition.x, top: orbPosition.y, right: "auto", bottom: "auto" }}
          onPointerDown={startOrbInteraction}
          onClick={(event) => {
            if (orbDraggedRef.current) {
              event.preventDefault();
              orbDraggedRef.current = false;
              return;
            }
            setMinimized(false);
          }}
          aria-label="打开 Lumora Agent；可拖动悬浮球"
          title="拖动可移动，单击打开"
        ><Bot /><span>AI</span></button>
      );
    }
    return (
      <aside
        ref={dockRef}
        className="agent-dock"
        data-ripple-block
        style={{ left: dockRect.x, top: dockRect.y, width: dockRect.width, height: dockRect.height }}
      >
        <div className="agent-dock-actions">
          <button className="agent-dock-drag-handle" type="button" onPointerDown={(event) => startDockInteraction(event, "move")} aria-label="拖动 Agent 窗口"><GripHorizontal /><span>拖动窗口</span></button>
          <span />
          <button type="button" onClick={() => onNavigate("agent")}><Maximize2 />返回 AI 空间</button>
          <button type="button" onClick={() => setMinimized(true)} aria-label="缩成悬浮球"><Minimize2 /></button>
        </div>
        {chat}
        <button className="agent-dock-resize" type="button" onPointerDown={(event) => startDockInteraction(event, "resize")} aria-label="调整 Agent 窗口大小" title="拖动调整大小" />
      </aside>
    );
  }

  if (!usingAgent) {
    return (
      <div className="agent-showcase-page" data-ripple-block>
        <iframe
          ref={sourceFrameRef}
          className="agent-showcase-frame"
          src="/active-theory/frame.html?v=lumora-agent-v8"
          title="Lumora Agent 动态作品空间"
          sandbox="allow-scripts allow-same-origin"
        />
        <header className="agent-showcase-header">
          <div className="agent-showcase-actions">
            <button type="button" onClick={() => onNavigate("innovation")}><ArrowLeft />返回创新界面</button>
          </div>
          <span>LUMORA 智能导师 / 互动展厅</span>
        </header>
        {!sourceAtEnd && <div className="agent-showcase-hint" aria-hidden="true"><span>向下滚动探索</span><i /></div>}
        {sourceAtEnd && (
          <button className="agent-showcase-bottom-entry" type="button" aria-label="进入 Agent 对话" onClick={() => { setActivated(true); setUsingAgent(true); }}>
            <Bot /><span>进入 Agent 对话</span><small>LUMORA 智能导师 / 互动展厅</small>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="agent-use-page" data-ripple-block>
      <header className="agent-use-nav">
        <button className="agent-at-brand" type="button" onClick={() => setUsingAgent(false)}><span>LU</span><b>Lumora 智能导师</b><small>静态工作区 / 06</small></button>
        <div>
          <span>{userName ? `${userName}，欢迎回来` : "AI 密码学导师"}</span>
          <button type="button" onClick={() => setUsingAgent(false)}><ArrowLeft />返回动态展厅</button>
          <button className="agent-use-exit" type="button" onClick={() => { setActivated(true); setMinimized(false); onNavigate("innovation"); }}><X />退出到创新页</button>
        </div>
      </header>

      <main className="agent-use-layout">
        <section className="agent-use-workspace">
          <div className="agent-use-workspace-title">
            <span>实时导师 / 静态模式</span>
            <h1>今天想探索什么？</h1>
            <p>在一处安静、清晰的空间里提出问题，或让导师陪你完成一次密码学实验。</p>
          </div>
          {chat}
        </section>
      </main>

      <footer className="agent-use-footer">
        <span><BrainCircuit />感知当前界面</span><i /><span><Compass />规划教学步骤</span><i /><span><Play />执行安全工具</span><i /><span><BookOpen />解释执行结果</span>
      </footer>
    </div>
  );
}
