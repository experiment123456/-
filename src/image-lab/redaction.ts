// 海草遮罩舱 · 局部隐私脱敏算法层
// 复用平台的 AES-256-GCM 与 MD5：只对选中矩形的像素做加密，
// 其余区域保持可预览；授权者输入相同密钥后可局部恢复。

import { aesDecryptBytes, aesEncryptBytes, md5 } from "../crypto/engine";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RedactedRegion extends Region {
  cipher: string; // 该区域原始 RGBA 像素的 AES-GCM 密文（Base64）
  digest: string; // 原始像素 MD5，用于恢复时完整性校验
}

export interface RedactionExport {
  format: "lumora-redaction-v1";
  image: string;
  width: number;
  height: number;
  createdAt: string;
  regions: RedactedRegion[];
}

// 把任意方向拖拽出的矩形规整为画布内的整数区域。
export function normalizeRegion(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): Region {
  const x1 = Math.max(0, Math.min(a.x, b.x));
  const y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(width, Math.max(a.x, b.x));
  const y2 = Math.min(height, Math.max(a.y, b.y));
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
}

export function clampRegion(region: Region, width: number, height: number): Region {
  const x = Math.max(0, Math.min(Math.round(region.x), width - 1));
  const y = Math.max(0, Math.min(Math.round(region.y), height - 1));
  const w = Math.max(1, Math.min(Math.round(region.w), width - x));
  const h = Math.max(1, Math.min(Math.round(region.h), height - y));
  return { x, y, w, h };
}

// 读取选中区域的原始像素并做 AES-GCM 加密，返回可保存的密文与校验值。
export async function encryptRegion(ctx: CanvasRenderingContext2D, region: Region, passphrase: string): Promise<RedactedRegion> {
  const { x, y, w, h } = region;
  const imageData = ctx.getImageData(x, y, w, h);
  const bytes = new Uint8Array(imageData.data.slice().buffer);
  const digest = md5(bytes);
  const cipher = await aesEncryptBytes(bytes, passphrase);
  return { x, y, w, h, cipher, digest };
}

// 用密钥解密并把原始像素写回画布，附带完整性校验。
export async function restoreRegion(ctx: CanvasRenderingContext2D, region: RedactedRegion, passphrase: string): Promise<void> {
  const bytes = await aesDecryptBytes(region.cipher, passphrase);
  if (bytes.length !== region.w * region.h * 4) throw new Error("密文尺寸与区域不匹配");
  if (md5(bytes) !== region.digest) throw new Error("完整性校验失败：密文已被修改");
  const clamped = new Uint8ClampedArray(bytes);
  ctx.putImageData(new ImageData(clamped, region.w, region.h), region.x, region.y);
}

// 在画布上对区域做马赛克 + 半透明海草遮罩，用于脱敏预览。
export function applyMosaic(ctx: CanvasRenderingContext2D, region: Region, block = 12, tint = "rgba(167,139,250,0.32)"): void {
  const { x, y, w, h } = region;
  const data = ctx.getImageData(x, y, w, h);
  const px = data.data;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < block && by + dy < h; dy += 1) {
        for (let dx = 0; dx < block && bx + dx < w; dx += 1) {
          const i = ((by + dy) * w + (bx + dx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; count += 1;
        }
      }
      r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
      for (let dy = 0; dy < block && by + dy < h; dy += 1) {
        for (let dx = 0; dx < block && bx + dx < w; dx += 1) {
          const i = ((by + dy) * w + (bx + dx)) * 4;
          px[i] = r; px[i + 1] = g; px[i + 2] = b;
        }
      }
    }
  }
  ctx.putImageData(data, x, y);
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);
}

export function buildExport(imageName: string, width: number, height: number, regions: RedactedRegion[]): RedactionExport {
  return { format: "lumora-redaction-v1", image: imageName, width, height, createdAt: new Date().toISOString(), regions };
}
