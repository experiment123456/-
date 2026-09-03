// 潜光实验舱 · 隐写算法层
// 先用 AES-256-GCM 加密秘密内容，再把密文以 LSB 隐写进 PNG 的 R/G/B 三通道。
// 这样图片看起来正常（隐写），即使被提取也仍是密文（加密），双重保护。

import { aesDecryptBytes, aesEncryptBytes, decodeUtf8, utf8 } from "../crypto/engine";

const MAGIC = [0x4c, 0x53, 0x42, 0x31]; // "LSB1"
const HEADER_BYTES = 8; // 4 魔数 + 4 载荷长度

export function capacityBytes(width: number, height: number): number {
  return Math.floor((width * height * 3) / 8) - HEADER_BYTES;
}

function embedPayload(ctx: CanvasRenderingContext2D, width: number, height: number, payload: Uint8Array): void {
  const bytes = new Uint8Array(HEADER_BYTES + payload.length);
  bytes.set(MAGIC, 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, false);
  bytes.set(payload, HEADER_BYTES);
  const totalBits = bytes.length * 8;
  if (totalBits > width * height * 3) throw new Error("载荷超出图片 LSB 容量");
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  let bit = 0;
  for (let i = 0; i < px.length && bit < totalBits; i += 4) {
    for (let channel = 0; channel < 3 && bit < totalBits; channel += 1) {
      const value = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1;
      px[i + channel] = (px[i + channel] & 0xfe) | value;
      bit += 1;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function extractPayload(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8Array | null {
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const capacity = width * height * 3;
  let bitPos = 0;
  const readByte = (): number => {
    let value = 0;
    for (let k = 0; k < 8; k += 1) {
      if (bitPos >= capacity) throw new Error("越界");
      const pixel = Math.floor(bitPos / 3);
      const channel = bitPos % 3;
      value = (value << 1) | (px[pixel * 4 + channel] & 1);
      bitPos += 1;
    }
    return value;
  };
  try {
    for (let i = 0; i < MAGIC.length; i += 1) if (readByte() !== MAGIC[i]) return null;
    const length = (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
    if (length <= 0 || length > capacity / 8) return null;
    const payload = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) payload[i] = readByte();
    return payload;
  } catch {
    return null;
  }
}

export interface EmbedResult {
  payloadBytes: number;
  capacityBytes: number;
  capacityUsed: number; // 百分比 0–100
}

export async function embedSecret(ctx: CanvasRenderingContext2D, width: number, height: number, secret: string, passphrase: string): Promise<EmbedResult> {
  const cipher = await aesEncryptBytes(utf8(secret), passphrase); // Base64 字符串
  const payload = utf8(cipher);
  const total = capacityBytes(width, height);
  if (payload.length > total) throw new Error(`密文 ${payload.length}B 超出容量 ${total}B，请缩短秘密或换更大图片`);
  embedPayload(ctx, width, height, payload);
  return { payloadBytes: payload.length, capacityBytes: total, capacityUsed: Math.min(100, (payload.length / total) * 100) };
}

export async function extractSecret(ctx: CanvasRenderingContext2D, width: number, height: number, passphrase: string): Promise<string> {
  const payload = extractPayload(ctx, width, height);
  if (!payload) throw new Error("未检测到隐写载荷，或图片已被压缩/篡改");
  const cipher = decodeUtf8(payload);
  return decodeUtf8(await aesDecryptBytes(cipher, passphrase));
}
