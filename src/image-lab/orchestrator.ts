// 洋流调度舱 · 自适应密码编排规则引擎
// 根据文件特征与用户意图，自动推荐密码策略，无需手动选算法。

import type { CapsuleId } from "./types";

export type Intent = "covert" | "share" | "store";

export interface FileFeatures {
  name: string;
  sizeBytes: number;
  mime: string;
  isImage: boolean;
  isPng: boolean;
  hasSensitiveRegion: boolean;
}

export interface Decision {
  strategy: string;
  chain: string[];
  rationale: string;
  algorithms: string[];
  route: CapsuleId | null; // 建议跳转执行的功能舱
  routeLabel: string;
  alert: boolean;
}

export const INTENT_LABELS: Record<Intent, string> = {
  covert: "隐蔽传输",
  share: "对外分享",
  store: "常规存储",
};

const KB = 1024;
const MB = 1024 * 1024;

// 规则按优先级从上到下匹配：隐私 > 体积 > 意图 > 默认。
export function decide(features: FileFeatures, intent: Intent): Decision {
  const { sizeBytes, isImage, isPng, hasSensitiveRegion, mime } = features;

  if (!isImage && mime.startsWith("text/") && sizeBytes <= KB) {
    return {
      strategy: "SM2 直接加密",
      chain: ["Detect", "SM2 Encrypt", "Transfer"],
      rationale: "小体积文本，适合公钥直接加密，无需对称密钥协商。",
      algorithms: ["SM2"],
      route: null,
      routeLabel: "前往单机实验台执行 SM2",
      alert: false,
    };
  }

  if (isImage && hasSensitiveRegion) {
    return {
      strategy: "局部脱敏（区域 AES-GCM）",
      chain: ["Detect", "Redact", "AES-GCM", "Transfer"],
      rationale: "检测到敏感区域（如二维码/证件信息），应只加密敏感区，其余保持可预览。",
      algorithms: ["AES-256-GCM"],
      route: "redaction",
      routeLabel: "跳转海草遮罩舱脱敏",
      alert: true,
    };
  }

  if (sizeBytes > 5 * MB) {
    return {
      strategy: "AES 分片传输",
      chain: ["Detect", "Chunk", "AES-GCM", "Transfer"],
      rationale: "文件大于 5MB，建议分片后逐片 AES-GCM 加密，经双机通道传输。",
      algorithms: ["AES-256-GCM"],
      route: null,
      routeLabel: "前往双机通信分片传输",
      alert: false,
    };
  }

  if (isImage && intent === "covert") {
    return {
      strategy: "AES + LSB 隐蔽传输",
      chain: ["Detect", "AES Encrypt", "LSB Embed", "Transfer"],
      rationale: "意图为隐蔽传输：先 AES 加密再 LSB 隐写，内容看不懂且通信看不见。",
      algorithms: ["AES-256-GCM", "LSB"],
      route: "stego",
      routeLabel: "跳转潜光实验舱隐写",
      alert: false,
    };
  }

  if (isImage && intent === "share") {
    return {
      strategy: "数字水印 + SM2 签名",
      chain: ["Detect", "Watermark", "SM2 Sign", "Transfer"],
      rationale: "意图为对外分享：嵌入不可见水印并 SM2 签名，泄露后可溯源取证。",
      algorithms: ["LSB", "SM2"],
      route: "watermark",
      routeLabel: "跳转浮游指纹舱签发水印",
      alert: false,
    };
  }

  if (isImage) {
    return {
      strategy: "整图 AES-GCM",
      chain: ["Detect", "AES-GCM", "Transfer"],
      rationale: "常规图片默认整图 AES-256-GCM 加密，兼顾机密性与完整性。",
      algorithms: ["AES-256-GCM"],
      route: null,
      routeLabel: "前往双机通信传输",
      alert: false,
    };
  }

  return {
    strategy: "整文件 AES-GCM",
    chain: ["Detect", "AES-GCM", "Transfer"],
    rationale: "通用文件默认整文件 AES-256-GCM 加密。",
    algorithms: ["AES-256-GCM"],
    route: null,
    routeLabel: "前往双机通信传输",
    alert: false,
  };
}

export function describeSize(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}
