import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Download, Eye, KeyRound, QrCode, ScanLine, ShieldCheck, Trash2 } from "lucide-react";
import { detectQrRegion } from "../../image-lab/detect-qrcode";
import { applyMosaic, buildExport, clampRegion, encryptRegion, normalizeRegion, restoreRegion, type RedactedRegion, type Region } from "../../image-lab/redaction";
import type { LoadedImage, TelemetryEvent } from "../../image-lab/types";

interface PanelProps {
  image: LoadedImage | null;
  color: string;
  glow: string;
  send: (event: TelemetryEvent) => void;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function RedactionPanel({ image, color, glow, send }: PanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [selection, setSelection] = useState<Region | null>(null);
  const [regions, setRegions] = useState<RedactedRegion[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<{ text: string; kind: "info" | "ok" | "warn" }>({ text: "上传图片后，在画面上按住拖拽即可框选敏感区域", kind: "info" });
  const [busy, setBusy] = useState(false);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    setScale(canvas.clientWidth / canvas.width);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      setRegions([]);
      setSelection(null);
      setStatus({ text: "按住鼠标拖拽框选，或点击「检测二维码」自动定位", kind: "info" });
      measure();
    };
    img.src = image.url;
  }, [image, measure]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measure]);

  const toNatural = (event: ReactPointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!image) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragStartRef.current = toNatural(event);
    setSelection(null);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!dragStartRef.current || !canvas) return;
    setSelection(normalizeRegion(dragStartRef.current, toNatural(event), canvas.width, canvas.height));
  };

  const onPointerUp = () => {
    dragStartRef.current = null;
    if (selection && (selection.w < 4 || selection.h < 4)) setSelection(null);
  };

  const detectQr = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const region = detectQrRegion(ctx, canvas.width, canvas.height);
    if (!region) { setStatus({ text: "未检测到二维码，可尝试更清晰的图片或手动框选", kind: "warn" }); return; }
    setSelection(region);
    setStatus({ text: "已检测到二维码并自动框选，点击「脱敏加密选区」即可遮蔽", kind: "ok" });
  };

  const encryptSelection = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!selection || selection.w < 4 || selection.h < 4) { setStatus({ text: "请先框选一个敏感区域", kind: "warn" }); return; }
    if (!passphrase.trim()) { setStatus({ text: "请先输入脱敏密钥", kind: "warn" }); return; }
    const region = clampRegion(selection, canvas.width, canvas.height);
    setBusy(true);
    try {
      const redacted = await encryptRegion(ctx, region, passphrase.trim());
      applyMosaic(ctx, region, Math.max(6, Math.round(Math.min(region.w, region.h) / 12)), `${color}52`);
      const next = [...regions, redacted];
      setRegions(next);
      setSelection(null);
      send({ type: "redaction.completed", regions: next.length, bytes: region.w * region.h * 4 });
      setStatus({ text: `已脱敏并加密 ${next.length} 个区域，原始像素仅以密文保存`, kind: "ok" });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "加密失败", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const restoreAll = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!regions.length) { setStatus({ text: "当前没有已脱敏的区域", kind: "warn" }); return; }
    if (!passphrase.trim()) { setStatus({ text: "请输入密钥以恢复", kind: "warn" }); return; }
    setBusy(true);
    try {
      for (const region of regions) await restoreRegion(ctx, region, passphrase.trim());
      setRegions([]);
      setStatus({ text: "密钥正确，已局部恢复全部脱敏区域", kind: "ok" });
    } catch {
      setStatus({ text: "恢复失败：密钥错误或密文已被篡改", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const clearSelection = () => setSelection(null);

  const exportResult = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    if (!regions.length) { setStatus({ text: "请先至少脱敏一个区域再导出", kind: "warn" }); return; }
    const base = image.name.replace(/\.[^.]+$/, "");
    canvas.toBlob((blob) => { if (blob) download(blob, `${base}-redacted.png`); }, "image/png");
    const meta = buildExport(image.name, canvas.width, canvas.height, regions);
    download(new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }), `${base}-redaction.json`);
    setStatus({ text: "已导出脱敏预览图 PNG 与元数据 JSON（坐标 + 密文）", kind: "ok" });
  };

  const statusColor = status.kind === "ok" ? "#34d399" : status.kind === "warn" ? "#f87171" : "rgba(230,244,255,0.6)";

  return (
    <div className="il-panel">
      <div className="il-panel-main">
        <header className="il-panel-head">
          <span className="il-panel-dot" style={{ background: color, boxShadow: `0 0 18px ${glow}` }} />
          <div>
            <h2 style={{ color }}>局部隐私脱敏</h2>
            <p>框选或自动检测敏感区域 → 局部 AES-256-GCM 加密 → 马赛克遮蔽 → 凭密钥恢复 → 导出。</p>
          </div>
        </header>

        {image ? (
          <div className="il-canvas-wrap" style={{ borderColor: `${color}55` }}>
            <canvas
              ref={canvasRef}
              className="il-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {selection && selection.w > 0 && selection.h > 0 && (
              <div
                className="il-selection"
                style={{
                  left: selection.x * scale,
                  top: selection.y * scale,
                  width: selection.w * scale,
                  height: selection.h * scale,
                  borderColor: color,
                  boxShadow: `0 0 0 9999px rgba(2,20,40,0.35), 0 0 18px ${glow}`,
                }}
              />
            )}
          </div>
        ) : (
          <div className="il-preview" style={{ borderColor: `${color}55` }}>
            <div className="il-preview-empty">请在上方上传 PNG / JPG 图片，即可开始框选脱敏</div>
          </div>
        )}

        <div className="il-note workspace-card">
          <b style={{ color }}>业务场景 · 医院影像共享</b>
          <p>遮住患者姓名、病历号与二维码，其余影像仍可查看。脱敏区域以海草遮罩呈现，导出的 JSON 仅含坐标与 AES 密文，原始像素绝不明文落地。</p>
        </div>
      </div>

      <aside className="il-panel-side">
        <label className="field-label">
          <span>脱敏密钥（加密与恢复使用同一密钥）</span>
          <input
            className="field-control"
            type="text"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="例如 hospital-2026"
          />
        </label>

        <div className="il-toolbar">
          <button type="button" className="il-tool" onClick={detectQr} disabled={!image || busy}><QrCode size={15} /> 检测二维码</button>
          <button type="button" className="il-tool" onClick={clearSelection} disabled={!selection || busy}><ScanLine size={15} /> 清除框选</button>
          <button type="button" className="il-tool primary" style={{ borderColor: color, color }} onClick={() => void encryptSelection()} disabled={!image || busy}><ShieldCheck size={15} /> 脱敏加密选区</button>
          <button type="button" className="il-tool" onClick={() => void restoreAll()} disabled={!regions.length || busy}><Eye size={15} /> 输入密钥恢复</button>
          <button type="button" className="il-tool" onClick={exportResult} disabled={!regions.length || busy}><Download size={15} /> 导出图+JSON</button>
        </div>

        <p className="il-status" style={{ color: statusColor }}>{status.text}</p>

        <div className="il-roadmap workspace-card">
          <span className="il-side-title" style={{ color }}><KeyRound size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />已脱敏区域 · {regions.length}</span>
          {regions.length ? (
            <ul className="il-region-list">
              {regions.map((region, index) => (
                <li key={index}>
                  <b style={{ color }}>#{index + 1}</b>
                  <span>{region.w}×{region.h} @ ({region.x},{region.y})</span>
                  <em>{(region.cipher.length / 1024).toFixed(1)}KB 密文</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="il-action-hint" style={{ marginTop: 4 }}>尚无脱敏区域。框选后点击「脱敏加密选区」，该区域像素会被 AES-GCM 加密并打码。</p>
          )}
        </div>

        <button type="button" className="il-tool danger" onClick={() => { setRegions([]); setSelection(null); const c = canvasRef.current; if (c && image) { const img = new Image(); img.onload = () => c.getContext("2d")?.drawImage(img, 0, 0); img.src = image.url; } setStatus({ text: "已重置画布到原图", kind: "info" }); }} disabled={!image || busy}>
          <Trash2 size={15} /> 重置画布
        </button>
      </aside>
    </div>
  );
}
