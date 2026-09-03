// 海草遮罩舱 · 二维码自动检测（MVP：jsQR，一次检出一个码）
import jsQR from "jsqr";
import type { Region } from "./redaction";

// 在整幅画布上检测二维码，命中则返回其外接矩形（含少量外扩，保证遮住定位角）。
export function detectQrRegion(ctx: CanvasRenderingContext2D, width: number, height: number): Region | null {
  const image = ctx.getImageData(0, 0, width, height);
  const code = jsQR(image.data, width, height);
  if (!code) return null;
  const corners = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomRightCorner, code.location.bottomLeftCorner];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const pad = Math.round(Math.min(width, height) * 0.01);
  const x = Math.max(0, Math.floor(Math.min(...xs)) - pad);
  const y = Math.max(0, Math.floor(Math.min(...ys)) - pad);
  const right = Math.min(width, Math.ceil(Math.max(...xs)) + pad);
  const bottom = Math.min(height, Math.ceil(Math.max(...ys)) + pad);
  return { x, y, w: right - x, h: bottom - y };
}
