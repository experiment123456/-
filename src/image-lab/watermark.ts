// 浮游指纹舱 · 数字水印与版权取证算法层
// 流程：签发时把「SM2 签名的水印证书」通过 LSB 隐写进 PNG；
// 泄露溯源时从图片提取证书并用 SM2 验签，命中即锁定来源。

import { createSm2KeyPair, md5, sm2Sign, sm2Verify, type Sm2KeyPair } from "../crypto/engine";

// 魔数 "LWM1"，用于快速判断图片是否携带本平台水印。
const MAGIC = [0x4c, 0x57, 0x4d, 0x31];
const HEADER_BYTES = 8; // 4 魔数 + 4 载荷长度

export interface WatermarkCertificate {
  wid: string; // 水印 ID
  uid: string; // 持有者标识
  ts: number; // 签发时间戳
  fh: string; // 文件指纹（绑定进签名）
  sig: string; // SM2 签名（r||s hex）
  pub: { x: string; y: string }; // 签发方公钥，供验签
}

export function createIssuerKey(): Sm2KeyPair {
  return createSm2KeyPair();
}

export function makeWatermarkId(uid: string): string {
  return `WM-${md5(`${uid}:${Date.now()}:${Math.random()}`).slice(0, 8).toUpperCase()}`;
}

// 参与签名的规范化字符串；验签时按同一顺序重建。
function signedMessage(cert: Pick<WatermarkCertificate, "wid" | "uid" | "ts" | "fh">): string {
  return `${cert.wid}|${cert.uid}|${cert.ts}|${cert.fh}`;
}

export function issueCertificate(uid: string, coverName: string, issuer: Sm2KeyPair): WatermarkCertificate {
  const wid = makeWatermarkId(uid);
  const ts = Date.now();
  const fh = md5(`${coverName}:${uid}:${ts}`);
  const sig = sm2Sign(signedMessage({ wid, uid, ts, fh }), JSON.stringify(issuer));
  return { wid, uid, ts, fh, sig, pub: { x: issuer.public.x, y: issuer.public.y } };
}

export function verifyCertificate(cert: WatermarkCertificate): boolean {
  return sm2Verify(signedMessage(cert), cert.sig, JSON.stringify(cert.pub));
}

export function capacityBytes(width: number, height: number): number {
  return Math.floor((width * height * 3) / 8) - HEADER_BYTES;
}

function certToBytes(cert: WatermarkCertificate): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(cert));
  const bytes = new Uint8Array(HEADER_BYTES + payload.length);
  bytes.set(MAGIC, 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, false);
  bytes.set(payload, HEADER_BYTES);
  return bytes;
}

// 把证书写入 R/G/B 三通道的最低位（跳过 alpha，减少可见性）。
export function embedWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, cert: WatermarkCertificate): void {
  const bytes = certToBytes(cert);
  const totalBits = bytes.length * 8;
  if (totalBits > width * height * 3) throw new Error("图片容量不足以嵌入水印，请换更大的图片");
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

export function extractWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): WatermarkCertificate | null {
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
    for (let i = 0; i < MAGIC.length; i += 1) {
      if (readByte() !== MAGIC[i]) return null;
    }
    const length = (readByte() << 24) | (readByte() << 16) | (readByte() << 8) | readByte();
    if (length <= 0 || length > capacity / 8) return null;
    const payload = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) payload[i] = readByte();
    const cert = JSON.parse(new TextDecoder().decode(payload)) as WatermarkCertificate;
    if (!cert.wid || !cert.sig || !cert.pub) return null;
    return cert;
  } catch {
    return null;
  }
}
