import { useEffect, useMemo, useState } from "react";
import { FileSearch, Radar, Waypoints, Zap } from "lucide-react";
import { detectQrRegion } from "../../image-lab/detect-qrcode";
import { decide, describeSize, INTENT_LABELS, type FileFeatures, type Intent } from "../../image-lab/orchestrator";
import type { CapsuleId, LoadedImage, TelemetryEvent } from "../../image-lab/types";

interface PanelProps {
  image: LoadedImage | null;
  color: string;
  glow: string;
  send: (event: TelemetryEvent) => void;
  onRoute?: (capsule: CapsuleId) => void;
}

function featuresFromImage(image: LoadedImage): FileFeatures {
  const isPng = /\.png$/i.test(image.name);
  return {
    name: image.name,
    sizeBytes: image.bytes,
    mime: isPng ? "image/png" : "image/jpeg",
    isImage: true,
    isPng,
    hasSensitiveRegion: false,
  };
}

function loadToCanvas(src: string): Promise<CanvasRenderingContext2D & { canvasWidth: number; canvasHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("无法创建画布")); return; }
      ctx.drawImage(img, 0, 0);
      Object.assign(ctx, { canvasWidth: canvas.width, canvasHeight: canvas.height });
      resolve(ctx as CanvasRenderingContext2D & { canvasWidth: number; canvasHeight: number });
    };
    img.onerror = () => reject(new Error("图片解析失败"));
    img.src = src;
  });
}

export default function OrchestratorPanel({ image, color, glow, send, onRoute }: PanelProps) {
  const [features, setFeatures] = useState<FileFeatures | null>(image ? featuresFromImage(image) : null);
  const [intent, setIntent] = useState<Intent>("store");
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setFeatures(image ? featuresFromImage(image) : null);
    setStatus("");
  }, [image]);

  const decision = useMemo(() => (features ? decide(features, intent) : null), [features, intent]);

  const scanSensitive = async () => {
    if (!image || !features) return;
    setScanning(true);
    try {
      const ctx = await loadToCanvas(image.url);
      const region = detectQrRegion(ctx, ctx.canvasWidth, ctx.canvasHeight);
      setFeatures({ ...features, hasSensitiveRegion: Boolean(region) });
      setStatus(region ? "检测到二维码 → 判定为含敏感区域，策略已切换为局部脱敏" : "未检测到二维码等敏感区域");
    } catch {
      setStatus("敏感区域检测失败");
    } finally {
      setScanning(false);
    }
  };

  const execute = () => {
    if (!decision) return;
    send({ type: "orchestrator.decision", strategy: decision.strategy });
    if (decision.route && onRoute) {
      onRoute(decision.route);
    } else {
      setStatus(`已下发决策：${decision.strategy}。${decision.routeLabel}`);
    }
  };

  return (
    <div className="il-panel">
      <div className="il-panel-main">
        <header className="il-panel-head">
          <span className="il-panel-dot" style={{ background: color, boxShadow: `0 0 18px ${glow}` }} />
          <div>
            <h2 style={{ color }}>自适应密码编排</h2>
            <p>读取文件类型/体积/敏感度与传输意图，规则引擎自动推荐密码策略并生成决策链。</p>
          </div>
        </header>

        <div className="il-feature-card workspace-card">
          <span className="il-side-title" style={{ color }}><FileSearch size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />文件特征</span>
          {features ? (
            <div className="il-feature-grid">
              <div><span>文件名</span><b>{features.name}</b></div>
              <div><span>体积</span><b>{describeSize(features.sizeBytes)}</b></div>
              <div><span>类型</span><b>{features.isPng ? "PNG" : features.isImage ? "JPG/图片" : features.mime || "未知"}</b></div>
              <div><span>敏感区域</span><b style={{ color: features.hasSensitiveRegion ? "#f87171" : undefined }}>{features.hasSensitiveRegion ? "检测到" : "未检测"}</b></div>
            </div>
          ) : (
            <p className="il-action-hint" style={{ marginTop: 6 }}>请在上方上传图片，或直接查看下方默认策略。</p>
          )}
        </div>

        {decision && (
          <div className="il-decision workspace-card" style={{ borderColor: `${color}44` }}>
            <span className="il-side-title" style={{ color }}><Waypoints size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />推荐策略</span>
            <div className="il-decision-strategy" style={{ color: decision.alert ? "#f87171" : color }}>{decision.strategy}</div>
            <div className="il-chain">
              {decision.chain.map((step, index) => (
                <span key={step + index}>
                  <i style={{ borderColor: `${color}88`, color }}>{step}</i>
                  {index < decision.chain.length - 1 && <em style={{ color: `${color}88` }}>→</em>}
                </span>
              ))}
            </div>
            <p className="il-decision-rationale">{decision.rationale}</p>
            <div className="il-decision-tags">
              {decision.algorithms.map((algo) => <span key={algo} style={{ borderColor: `${color}66`, color }}>{algo}</span>)}
            </div>
          </div>
        )}
      </div>

      <aside className="il-panel-side">
        <div className="il-intent workspace-card">
          <span className="il-side-title" style={{ color }}>传输意图</span>
          <div className="il-intent-options">
            {(Object.keys(INTENT_LABELS) as Intent[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`il-intent-btn ${intent === key ? "is-active" : ""}`}
                style={intent === key ? { borderColor: color, color } : undefined}
                onClick={() => setIntent(key)}
              >
                {INTENT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="il-tool" onClick={() => void scanSensitive()} disabled={!image || scanning}><Radar size={15} /> {scanning ? "检测中…" : "检测敏感区域"}</button>
        <button type="button" className="il-tool primary" style={{ borderColor: color, color }} onClick={execute} disabled={!decision}><Zap size={15} /> 一键执行推荐策略</button>
        {status && <p className="il-status" style={{ color: "rgba(230,244,255,0.7)" }}>{status}</p>}

        <div className="il-roadmap workspace-card">
          <span className="il-side-title" style={{ color }}>规则表（MVP）</span>
          <ul className="il-rule-list">
            <li><span>文本 ≤ 1KB</span><b>SM2</b></li>
            <li><span>图片 + 敏感区域</span><b>局部脱敏</b></li>
            <li><span>图片 + 隐蔽传输</span><b>AES + LSB</b></li>
            <li><span>图片 + 对外分享</span><b>水印 + SM2</b></li>
            <li><span>文件 &gt; 5MB</span><b>AES 分片</b></li>
            <li><span>默认图片</span><b>整图 AES-GCM</b></li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
