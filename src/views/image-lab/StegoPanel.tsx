import { useEffect, useRef, useState } from "react";
import { Download, Eye, FlaskConical, Layers, Radar, ShieldCheck } from "lucide-react";
import { capacityBytes, embedSecret, extractSecret } from "../../image-lab/lsb-stego";
import { changedPixels, diffHeatmap, psnr } from "../../image-lab/metrics";
import { analyzeLsb, type StegoAnalysis } from "../../image-lab/steganalysis";
import { bitPlane, downscaleImageData, lsbXor } from "../../image-lab/bitplane";
import type { LoadedImage, TelemetryEvent } from "../../image-lab/types";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [125, 211, 252];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawImageData(canvas: HTMLCanvasElement | null, data: ImageData) {
  if (!canvas) return;
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext("2d")?.putImageData(data, 0, 0);
}

// LSB 位平面 / XOR 可视化：把细微隐写改动放大成可读图。
function LsbVisualizer({ coverData, stegoData, color }: { coverData: ImageData | null; stegoData: ImageData | null; color: string }) {
  const [view, setView] = useState<"xor" | "planes">("xor");
  const xorRef = useRef<HTMLCanvasElement | null>(null);
  const planeRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const accent = hexToRgb(color);

  useEffect(() => {
    if (view !== "xor" || !coverData || !stegoData) return;
    drawImageData(xorRef.current, lsbXor(coverData, stegoData, accent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, coverData, stegoData]);

  useEffect(() => {
    if (view !== "planes") return;
    const src = stegoData ?? coverData;
    if (!src) return;
    const small = downscaleImageData(src, 480);
    for (let bit = 7; bit >= 0; bit -= 1) {
      drawImageData(planeRefs.current[7 - bit], bitPlane(small, bit));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, coverData, stegoData]);

  if (!coverData) return null;

  return (
    <div className="il-lsb workspace-card" style={{ ["--c" as string]: color }}>
      <div className="il-lsb-head">
        <span className="il-side-title" style={{ color }}>
          <Layers size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />LSB 位平面可视化
        </span>
        <div className="il-lsb-tabs">
          <button type="button" className={`il-lsb-tab ${view === "xor" ? "is-active" : ""}`} onClick={() => setView("xor")}>改动位 (XOR)</button>
          <button type="button" className={`il-lsb-tab ${view === "planes" ? "is-active" : ""}`} onClick={() => setView("planes")}>位平面分解</button>
        </div>
      </div>

      {view === "xor" ? (
        stegoData ? (
          <div className="il-lsb-xor">
            <canvas ref={xorRef} />
            <p className="il-lsb-caption">cover ⊕ stego 的最低位：亮点即被 LSB 隐写改动的像素（已 1px 膨胀便于观察）。改动集中处即密文的嵌入分布。</p>
          </div>
        ) : (
          <div className="il-lsb-empty">完成「AES 加密并隐写」后，这里显示 cover ⊕ stego 的改动位分布。</div>
        )
      ) : (
        <>
          <div className="il-plane-grid">
            {Array.from({ length: 8 }).map((_, idx) => {
              const bit = 7 - idx;
              return (
                <div key={bit} className={`il-plane-cell ${bit === 0 ? "is-lsb" : ""}`}>
                  <canvas ref={(el) => { planeRefs.current[idx] = el; }} />
                  <span>bit {bit}{bit === 7 ? " · MSB" : bit === 0 ? " · LSB" : ""}</span>
                </div>
              );
            })}
          </div>
          <p className="il-lsb-caption">高位平面（bit 7…）保留图像结构，低位平面（bit 0/LSB）近似随机噪声——隐写正是把密文写进 bit 0，因此嵌入后该层更「满」。{stegoData ? "当前显示隐写图。" : "当前显示原图，隐写后可再对比。"}</p>
        </>
      )}
    </div>
  );
}

interface PanelProps {
  image: LoadedImage | null;
  color: string;
  glow: string;
  send: (event: TelemetryEvent) => void;
}

interface Status { text: string; kind: "info" | "ok" | "warn"; }
interface Metrics { psnr: number; capacityUsed: number; changedRatio: number; }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function StegoPanel({ image, color, glow, send }: PanelProps) {
  const coverRef = useRef<HTMLCanvasElement | null>(null);
  const stegoRef = useRef<HTMLCanvasElement | null>(null);
  const diffRef = useRef<HTMLCanvasElement | null>(null);
  const coverDataRef = useRef<ImageData | null>(null);
  const [coverData, setCoverData] = useState<ImageData | null>(null);
  const [stegoData, setStegoData] = useState<ImageData | null>(null);
  const [secret, setSecret] = useState("会议纪要：周五 14:00 三号手术室复盘");
  const [passphrase, setPassphrase] = useState("");
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [detection, setDetection] = useState<{ stego: StegoAnalysis; cover: StegoAnalysis } | null>(null);
  const [status, setStatus] = useState<Status>({ text: "输入秘密与密钥，把密文隐写进图片，再做提取与检测。", kind: "info" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const cover = coverRef.current;
    const stego = stegoRef.current;
    const diff = diffRef.current;
    if (!cover || !stego || !diff || !image) return;
    const img = new Image();
    img.onload = () => {
      [cover, stego, diff].forEach((canvas) => { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; });
      const coverCtx = cover.getContext("2d");
      const stegoCtx = stego.getContext("2d");
      const diffCtx = diff.getContext("2d");
      if (!coverCtx || !stegoCtx || !diffCtx) return;
      coverCtx.drawImage(img, 0, 0);
      stegoCtx.drawImage(img, 0, 0);
      diffCtx.fillStyle = "#02101c";
      diffCtx.fillRect(0, 0, diff.width, diff.height);
      const coverImageData = coverCtx.getImageData(0, 0, cover.width, cover.height);
      coverDataRef.current = coverImageData;
      setCoverData(coverImageData);
      setStegoData(null);
      setReady(false); setMetrics(null); setExtracted(null); setDetection(null);
      setStatus({ text: "已载入封面图，可开始隐写嵌入", kind: "info" });
    };
    img.src = image.url;
  }, [image]);

  const embed = async () => {
    const stego = stegoRef.current;
    const cover = coverDataRef.current;
    const stegoCtx = stego?.getContext("2d");
    if (!stego || !stegoCtx || !cover) { setStatus({ text: "请先上传封面图", kind: "warn" }); return; }
    if (!secret.trim()) { setStatus({ text: "请输入要隐藏的秘密内容", kind: "warn" }); return; }
    if (!passphrase.trim()) { setStatus({ text: "请输入 AES 密钥", kind: "warn" }); return; }
    setBusy(true);
    try {
      stegoCtx.putImageData(cover, 0, 0);
      const result = await embedSecret(stegoCtx, stego.width, stego.height, secret.trim(), passphrase.trim());
      const stegoImageData = stegoCtx.getImageData(0, 0, stego.width, stego.height);
      const quality = psnr(cover, stegoImageData);
      const { ratio } = changedPixels(cover, stegoImageData);
      const diff = diffRef.current?.getContext("2d");
      if (diff) diff.putImageData(diffHeatmap(cover, stegoImageData), 0, 0);
      setStegoData(stegoImageData);
      setMetrics({ psnr: quality, capacityUsed: result.capacityUsed, changedRatio: ratio });
      setReady(true);
      setExtracted(null);
      setDetection(null);
      send({ type: "stego.embed", psnr: Number.isFinite(quality) ? Number(quality.toFixed(1)) : 99, capacityUsed: Math.round(result.capacityUsed) });
      setStatus({ text: `已隐写 ${result.payloadBytes}B 密文（容量占用 ${result.capacityUsed.toFixed(1)}%）`, kind: "ok" });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "嵌入失败", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    const stego = stegoRef.current;
    const stegoCtx = stego?.getContext("2d");
    if (!stego || !stegoCtx) return;
    if (!passphrase.trim()) { setStatus({ text: "请输入 AES 密钥以提取", kind: "warn" }); return; }
    setBusy(true);
    try {
      const message = await extractSecret(stegoCtx, stego.width, stego.height, passphrase.trim());
      setExtracted(message);
      setStatus({ text: "提取并解密成功，密钥正确", kind: "ok" });
    } catch {
      setExtracted(null);
      setStatus({ text: "提取失败：密钥错误、图片未隐写或已被破坏", kind: "warn" });
    } finally {
      setBusy(false);
    }
  };

  const detect = () => {
    const stego = stegoRef.current;
    const stegoCtx = stego?.getContext("2d");
    const cover = coverDataRef.current;
    if (!stego || !stegoCtx || !cover) return;
    const stegoSnapshot = stegoCtx.getImageData(0, 0, stego.width, stego.height);
    const result = { stego: analyzeLsb(stegoSnapshot), cover: analyzeLsb(cover) };
    setDetection(result);
    send({ type: "stego.detect", score: result.stego.score });
    if (result.stego.score >= 70) send({ type: "integrity.alert", module: "stego" });
    setStatus({ text: `隐写检测完成：可疑分 ${result.stego.score}%（原图 ${result.cover.score}%）`, kind: result.stego.score >= 70 ? "warn" : "info" });
  };

  const exportStego = () => {
    const stego = stegoRef.current;
    if (!stego || !image || !ready) { setStatus({ text: "请先完成隐写嵌入", kind: "warn" }); return; }
    const base = image.name.replace(/\.[^.]+$/, "");
    stego.toBlob((blob) => { if (blob) download(blob, `${base}-stego.png`); }, "image/png");
    setStatus({ text: "已导出隐写图 PNG（务必 PNG，JPEG 会破坏隐写数据）", kind: "ok" });
  };

  const statusColor = status.kind === "ok" ? "#34d399" : status.kind === "warn" ? "#f87171" : "rgba(230,244,255,0.6)";
  const total = image ? capacityBytes(image.width, image.height) : 0;

  return (
    <div className="il-panel">
      <div className="il-panel-main">
        <header className="il-panel-head">
          <span className="il-panel-dot" style={{ background: color, boxShadow: `0 0 18px ${glow}` }} />
          <div>
            <h2 style={{ color }}>隐写攻防</h2>
            <p>AES 加密秘密内容后 LSB 隐写进 PNG，再用 PSNR、LSB 位平面/XOR 与卡方检测形成攻防闭环。</p>
          </div>
        </header>

        {image ? (
          <div className="il-stego-grid">
            <figure><canvas ref={coverRef} className="il-stego-canvas" /><figcaption>封面原图</figcaption></figure>
            <figure><canvas ref={stegoRef} className="il-stego-canvas" style={{ borderColor: `${color}55` }} /><figcaption>隐写图（含密文）</figcaption></figure>
            <figure><canvas ref={diffRef} className="il-stego-canvas" /><figcaption>差分热力图（改动已增强）</figcaption></figure>
          </div>
        ) : (
          <div className="il-preview" style={{ borderColor: `${color}55` }}><div className="il-preview-empty">请在上方上传 PNG 封面图</div></div>
        )}

        {image && <LsbVisualizer coverData={coverData} stegoData={stegoData} color={color} />}

        <label className="field-label">
          <span>秘密内容（AES-256-GCM 加密后再隐写{total ? ` · 容量约 ${(total / 1024).toFixed(1)}KB` : ""}）</span>
          <textarea className="field-control" rows={3} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="要藏进图片的秘密文本" />
        </label>

        {extracted !== null && (
          <div className="il-note workspace-card">
            <b style={{ color }}>提取结果</b>
            <p style={{ whiteSpace: "pre-wrap" }}>{extracted}</p>
          </div>
        )}
      </div>

      <aside className="il-panel-side">
        <label className="field-label">
          <span>AES 密钥（嵌入与提取一致）</span>
          <input className="field-control" type="text" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="例如 stego-2026" />
        </label>

        <div className="il-toolbar">
          <button type="button" className="il-tool primary" style={{ borderColor: color, color }} onClick={() => void embed()} disabled={!image || busy}><FlaskConical size={15} /> AES 加密并隐写</button>
          <button type="button" className="il-tool" onClick={() => void extract()} disabled={!ready || busy}><Eye size={15} /> 提取并解密</button>
          <button type="button" className="il-tool" onClick={detect} disabled={!image || busy}><Radar size={15} /> 隐写检测评分</button>
          <button type="button" className="il-tool" onClick={exportStego} disabled={!ready || busy}><Download size={15} /> 导出隐写图</button>
        </div>

        <p className="il-status" style={{ color: statusColor }}>{status.text}</p>

        {metrics && (
          <div className="il-metrics workspace-card">
            <span className="il-side-title" style={{ color }}><ShieldCheck size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />质量指标</span>
            <div className="il-metric-row"><span>容量占用</span><b>{metrics.capacityUsed.toFixed(1)}%</b></div>
            <div className="il-metric-row"><span>PSNR</span><b>{Number.isFinite(metrics.psnr) ? `${metrics.psnr.toFixed(2)} dB` : "∞"}</b></div>
            <div className="il-metric-row"><span>改动像素</span><b>{(metrics.changedRatio * 100).toFixed(2)}%</b></div>
          </div>
        )}

        {detection && (
          <div className="il-metrics workspace-card">
            <span className="il-side-title" style={{ color }}><Radar size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />隐写检测（卡方 PoV）</span>
            <div className="il-score-bar"><i style={{ width: `${detection.stego.score}%`, background: detection.stego.score >= 70 ? "#f87171" : detection.stego.score >= 40 ? "#fbbf24" : "#34d399" }} /></div>
            <div className="il-metric-row"><span>隐写图可疑分</span><b style={{ color: detection.stego.score >= 70 ? "#f87171" : color }}>{detection.stego.score}%</b></div>
            <div className="il-metric-row"><span>原图可疑分</span><b>{detection.cover.score}%</b></div>
            <div className="il-metric-row"><span>约化卡方</span><b>{detection.stego.reduced.toFixed(2)}</b></div>
            <p className="il-action-hint" style={{ marginTop: 6 }}>{detection.stego.verdict}</p>
          </div>
        )}

        <div className="il-roadmap workspace-card">
          <span className="il-side-title" style={{ color }}>攻防闭环</span>
          <p className="il-action-hint" style={{ marginTop: 4 }}>AES 让内容「看不懂」，LSB 让通信「看不见」，卡方检测判断「有没有人在偷偷藏通信」。检测分≥70 会向海底大屏触发红色告警。</p>
        </div>
      </aside>
    </div>
  );
}
