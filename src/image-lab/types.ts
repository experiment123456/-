// Image Security Lab · 共享类型与功能舱元数据（路线 B 独立模块）
// telemetry 只承载匿名统计，不含明文、密钥或图片内容。

export type TelemetryEvent =
  | { type: "session.online"; sessionId: string }
  | { type: "redaction.completed"; regions: number; bytes: number }
  | { type: "watermark.issued"; watermarkId: string }
  | { type: "watermark.traced"; watermarkId: string; verified: boolean }
  | { type: "stego.embed"; psnr: number; capacityUsed: number }
  | { type: "stego.detect"; score: number }
  | { type: "orchestrator.decision"; strategy: string }
  | { type: "integrity.alert"; module: string };

export type TelemetryEventType = TelemetryEvent["type"];

export interface TelemetryRecord {
  id: number;
  event: TelemetryEvent;
  at: number;
}

export type CapsuleId = "redaction" | "stego" | "watermark" | "orchestrator";

export interface CapsuleMeta {
  id: CapsuleId;
  /** 中文功能名（唯一命名源，Tab / Panel 标题 / Ocean 卡片共用） */
  title: string;
  /** 英文标签（与 Ocean MODULES 一致） */
  label: string;
  mission: string;
  color: string;
  glow: string;
}

// 四模块正式命名（与 Ocean MODULES 单一命名源保持一致，去除「海底舱」旧称）。
export const CAPSULES: readonly CapsuleMeta[] = [
  { id: "redaction", title: "局部隐私脱敏", label: "PRIVACY REDACTION", mission: "手动框选 + 二维码检测 + 局部 AES-GCM + 预览/恢复", color: "#A78BFA", glow: "rgba(167,139,250,0.45)" },
  { id: "stego", title: "隐写攻防", label: "STEGO LAB", mission: "AES + LSB 嵌入 + PSNR + 位平面/XOR + 简化检测评分", color: "#60A5FA", glow: "rgba(96,165,250,0.45)" },
  { id: "watermark", title: "数字水印与版权取证", label: "WATERMARK & PROOF", mission: "用户水印 + SM2 签名 + 泄露追踪取证", color: "#FBBF24", glow: "rgba(251,191,36,0.45)" },
  { id: "orchestrator", title: "自适应密码编排", label: "ADAPTIVE CRYPTO", mission: "规则引擎按文件特征自动推荐密码策略", color: "#34D399", glow: "rgba(52,211,153,0.45)" },
] as const;

export const ALERT_COLOR = "#F87171";

export interface LoadedImage {
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
}
