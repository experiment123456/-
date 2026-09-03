import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ImageUp, Radio, Waves, X } from "lucide-react";
import { anonymousSessionId, useTelemetry } from "../image-lab/telemetry";
import { CAPSULES, type CapsuleId, type LoadedImage } from "../image-lab/types";
import RedactionPanel from "./image-lab/RedactionPanel";
import StegoPanel from "./image-lab/StegoPanel";
import WatermarkPanel from "./image-lab/WatermarkPanel";
import OrchestratorPanel from "./image-lab/OrchestratorPanel";

interface ImageLabViewProps {
  onNavigate: (target: "innovation" | "image-lab" | "ocean") => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

const statusText: Record<string, string> = {
  connecting: "遥测连接中",
  online: "遥测在线",
  offline: "遥测离线",
};

const CAPSULE_IDS: CapsuleId[] = ["redaction", "stego", "watermark", "orchestrator"];

function initialTab(): CapsuleId {
  try {
    const stored = sessionStorage.getItem("image-lab-tab");
    if (stored) {
      sessionStorage.removeItem("image-lab-tab");
      if (CAPSULE_IDS.includes(stored as CapsuleId)) return stored as CapsuleId;
    }
  } catch {
    /* sessionStorage 不可用时回落默认 */
  }
  return "redaction";
}

export default function ImageLabView({ onNavigate }: ImageLabViewProps) {
  const [active, setActive] = useState<CapsuleId>(initialTab);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<LoadedImage | null>(null);
  const { status, send } = useTelemetry({ subscribe: false });

  imageRef.current = image;

  useEffect(() => {
    const sessionId = anonymousSessionId();
    send({ type: "session.online", sessionId });
  }, [send]);

  useEffect(() => () => {
    if (imageRef.current) URL.revokeObjectURL(imageRef.current.url);
  }, []);

  const loadFile = useCallback((file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) { setError("请选择 PNG / JPG 图片文件"); return; }
    if (file.size > MAX_BYTES) { setError("图片过大，MVP 阶段限制 5 MB"); return; }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { name: file.name, url, width: probe.naturalWidth, height: probe.naturalHeight, bytes: file.size };
      });
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setError("图片解析失败，请更换文件"); };
    probe.src = url;
  }, []);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const clearImage = () => {
    setImage((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    if (inputRef.current) inputRef.current.value = "";
  };

  const capsule = CAPSULES.find((item) => item.id === active)!;
  const panelProps = { image, color: capsule.color, glow: capsule.glow, send };

  return (
    <div className="il-root">
      <header className="il-topbar" data-ripple-block>
        <button className="il-back liquid-glass" type="button" onClick={() => onNavigate("ocean")}>
          <ArrowLeft size={16} /> 返回海底大屏
        </button>
        <div className="il-title">
          <span className="il-title-mark"><Waves size={18} /></span>
          <div>
            <span className="il-eyebrow">IMAGE SECURITY LAB</span>
            <b>图像安全操作台</b>
          </div>
        </div>
        <div className="il-topbar-actions">
          <span className={`il-telemetry-pill liquid-glass ${status}`}><Radio size={13} /> {statusText[status]}</span>
          <button className="il-ocean-link liquid-glass" type="button" onClick={() => onNavigate("ocean")}>打开海底大屏 →</button>
        </div>
      </header>

      <div className="il-body">
        <section className="il-uploader workspace-card" data-ripple-block>
          <div
            className={`il-dropzone ${dragging ? "is-dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {image ? (
              <div className="il-thumb">
                <img src={image.url} alt={image.name} />
                <button className="il-thumb-clear" type="button" onClick={(event) => { event.stopPropagation(); clearImage(); }} aria-label="移除图片"><X size={14} /></button>
                <span>{image.name} · {image.width}×{image.height}</span>
              </div>
            ) : (
              <div className="il-drop-empty">
                <ImageUp size={26} />
                <b>点击或拖入图片</b>
                <small>PNG / JPG · ≤ 5 MB · 全程在浏览器本地处理</small>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) loadFile(file); }} />
          {error && <p className="il-error">{error}</p>}
        </section>

        <nav className="il-tabs" data-ripple-block>
          {CAPSULES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`il-tab ${active === item.id ? "is-active" : ""}`}
              onClick={() => setActive(item.id)}
              style={active === item.id ? { borderColor: item.color, color: item.color, boxShadow: `0 0 26px ${item.glow}` } : undefined}
            >
              <span className="il-tab-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="il-tab-dot" style={{ background: item.color, boxShadow: `0 0 12px ${item.glow}` }} />
              <b>{item.title}</b>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>

        <section className="il-stage panel-reveal" key={active}>
          {active === "redaction" && <RedactionPanel {...panelProps} />}
          {active === "stego" && <StegoPanel {...panelProps} />}
          {active === "watermark" && <WatermarkPanel {...panelProps} />}
          {active === "orchestrator" && <OrchestratorPanel {...panelProps} onRoute={setActive} />}
        </section>
      </div>
    </div>
  );
}
