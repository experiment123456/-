import { useRef, useState } from "react";
import { BadgeCheck, Fingerprint, ScanSearch, ShieldAlert, Stamp, Upload } from "lucide-react";
import type { Sm2KeyPair } from "../../crypto/engine";
import { capacityBytes, createIssuerKey, embedWatermark, extractWatermark, issueCertificate, verifyCertificate, type WatermarkCertificate } from "../../image-lab/watermark";
import type { LoadedImage, TelemetryEvent } from "../../image-lab/types";

interface PanelProps {
  image: LoadedImage | null;
  color: string;
  glow: string;
  send: (event: TelemetryEvent) => void;
}

interface Status { text: string; kind: "info" | "ok" | "warn"; }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadToCanvas(src: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("无法创建画布")); return; }
      ctx.drawImage(img, 0, 0);
      resolve({ canvas, ctx, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error("图片解析失败"));
    img.src = src;
  });
}

function loadIssuerKey(): Sm2KeyPair {
  try {
    const raw = localStorage.getItem("lumora-wm-issuer");
    if (raw) return JSON.parse(raw) as Sm2KeyPair;
  } catch { /* ignore */ }
  const key = createIssuerKey();
  try { localStorage.setItem("lumora-wm-issuer", JSON.stringify(key)); } catch { /* ignore */ }
  return key;
}

export default function WatermarkPanel({ image, color, glow, send }: PanelProps) {
  const [issuer] = useState<Sm2KeyPair>(() => loadIssuerKey());
  const [uid, setUid] = useState("DoctorA");
  const [issued, setIssued] = useState<WatermarkCertificate | null>(null);
  const [issueStatus, setIssueStatus] = useState<Status>({ text: "在上方上传封面图后，为其嵌入不可见水印并导出分享。", kind: "info" });
  const [trace, setTrace] = useState<{ cert: WatermarkCertificate; verified: boolean } | "notfound" | null>(null);
  const [traceStatus, setTraceStatus] = useState<Status>({ text: "上传疑似泄露的图片，提取并验签追踪来源。", kind: "info" });
  const [suspectUrl, setSuspectUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suspectInputRef = useRef<HTMLInputElement | null>(null);

  const issue = async () => {
    if (!image) { setIssueStatus({ text: "请先在上方上传封面图片", kind: "warn" }); return; }
    if (!uid.trim()) { setIssueStatus({ text: "请填写持有者标识（如 DoctorA）", kind: "warn" }); return; }
    setBusy(true);
    try {
      const { canvas, ctx, width, height } = await loadToCanvas(image.url);
      if (capacityBytes(width, height) < 400) { setIssueStatus({ text: "图片太小，容量不足以嵌入水印证书", kind: "warn" }); return; }
      const cert = issueCertificate(uid.trim(), image.name, issuer);
      embedWatermark(ctx, width, height, cert);
      const base = image.name.replace(/\.[^.]+$/, "");
      canvas.toBlob((blob) => { if (blob) download(blob, `${base}-watermarked.png`); }, "image/png");
      setIssued(cert);
      send({ type: "watermark.issued", watermarkId: cert.wid });
      setIssueStatus({ text: `已签发水印 ${cert.wid} 并导出 PNG（务必以 PNG 分享，JPEG 压缩会破坏 LSB）`, kind: "ok" });
    } catch (error) {
      setIssueStatus({ text: error instanceof Error ? error.message : "签发失败", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const onSuspect = async (file: File) => {
    if (!file.type.startsWith("image/")) { setTraceStatus({ text: "请选择图片文件", kind: "warn" }); return; }
    setBusy(true);
    setTrace(null);
    const url = URL.createObjectURL(file);
    setSuspectUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    try {
      const { ctx, width, height } = await loadToCanvas(url);
      const cert = extractWatermark(ctx, width, height);
      if (!cert) {
        setTrace("notfound");
        setTraceStatus({ text: "未提取到平台水印：图片可能未加水印，或已被压缩/裁剪/篡改导致水印丢失", kind: "warn" });
        return;
      }
      const verified = verifyCertificate(cert);
      setTrace({ cert, verified });
      send({ type: "watermark.traced", watermarkId: cert.wid, verified });
      setTraceStatus({
        text: verified ? `Trace Hit: ${cert.uid} · SM2 验签通过，来源可信` : "提取到水印但 SM2 验签失败：签名与公钥不匹配，疑似伪造",
        kind: verified ? "ok" : "warn",
      });
    } catch (error) {
      setTraceStatus({ text: error instanceof Error ? error.message : "溯源失败", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const issueColor = issueStatus.kind === "ok" ? "#34d399" : issueStatus.kind === "warn" ? "#f87171" : "rgba(230,244,255,0.6)";
  const traceColor = traceStatus.kind === "ok" ? "#34d399" : traceStatus.kind === "warn" ? "#f87171" : "rgba(230,244,255,0.6)";

  return (
    <div className="il-panel">
      <div className="il-panel-main">
        <header className="il-panel-head">
          <span className="il-panel-dot" style={{ background: color, boxShadow: `0 0 18px ${glow}` }} />
          <div>
            <h2 style={{ color }}>数字水印与版权取证</h2>
            <p>导出时把 SM2 签名的水印证书隐写进 PNG；泄露后提取并验签，锁定来源。</p>
          </div>
        </header>

        <div className="il-wm-section workspace-card">
          <span className="il-side-title" style={{ color }}><Stamp size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />① 签发水印（对上方封面图）</span>
          <label className="field-label" style={{ marginTop: 10 }}>
            <span>持有者标识（写入并绑定进 SM2 签名）</span>
            <input className="field-control" type="text" value={uid} onChange={(event) => setUid(event.target.value)} placeholder="DoctorA" />
          </label>
          <button type="button" className="il-tool primary" style={{ borderColor: color, color, marginTop: 12 }} onClick={() => void issue()} disabled={!image || busy}>
            <BadgeCheck size={15} /> 嵌入水印并导出 PNG
          </button>
          <p className="il-status" style={{ color: issueColor }}>{issueStatus.text}</p>
          {issued && (
            <div className="il-wm-cert">
              <div><span>水印 ID</span><b style={{ color }}>{issued.wid}</b></div>
              <div><span>持有者</span><b>{issued.uid}</b></div>
              <div><span>签发时间</span><b>{new Date(issued.ts).toLocaleString("zh-CN", { hour12: false })}</b></div>
              <div><span>SM2 签名</span><b className="il-wm-mono">{issued.sig.slice(0, 24)}…</b></div>
            </div>
          )}
        </div>

        <div className="il-note workspace-card">
          <b style={{ color }}>答辩故事衔接</b>
          <p>脱敏后的影像对外分享前，在此嵌入不可见水印并 SM2 签名；一旦泄露，用右侧「泄露溯源」提取水印验签，即可指认泄露者，形成「脱敏 → 分享 → 溯源」完整闭环。</p>
        </div>
      </div>

      <aside className="il-panel-side">
        <div className="il-wm-section workspace-card">
          <span className="il-side-title" style={{ color }}><ScanSearch size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />② 泄露溯源（上传疑似泄露图）</span>
          <div className="il-suspect-drop" onClick={() => suspectInputRef.current?.click()} role="button" tabIndex={0}>
            {suspectUrl ? <img src={suspectUrl} alt="疑似泄露图" /> : <div className="il-drop-empty"><Upload size={22} /><small>点击上传疑似泄露的 PNG</small></div>}
          </div>
          <input ref={suspectInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onSuspect(file); }} />
          <p className="il-status" style={{ color: traceColor }}>{traceStatus.text}</p>

          {trace === "notfound" && (
            <div className="il-trace-result is-warn"><ShieldAlert size={16} /><span>未命中 · 无有效平台水印</span></div>
          )}
          {trace && trace !== "notfound" && (
            <div className={`il-trace-result ${trace.verified ? "is-ok" : "is-warn"}`}>
              <Fingerprint size={16} />
              <div>
                <b>{trace.verified ? `Trace Hit: ${trace.cert.uid}` : "验签失败 · 疑似伪造"}</b>
                <small>{trace.cert.wid} · {new Date(trace.cert.ts).toLocaleString("zh-CN", { hour12: false })}</small>
              </div>
            </div>
          )}
        </div>

        <div className="il-roadmap workspace-card">
          <span className="il-side-title" style={{ color }}>取证要点</span>
          <p className="il-action-hint" style={{ marginTop: 4 }}>水印证书 = <code>{"{wid,uid,ts,fh}"}</code> + SM2 签名，经 LSB 隐写进 PNG。验签用嵌入的公钥，签名不可伪造；LSB 被压缩/涂改则提取失败，等同篡改告警。</p>
        </div>
      </aside>
    </div>
  );
}
