// 开场时间轴相位（秒）与色彩脚本——与规格 docs/superpowers/specs/2026-09-08-welcome-cinematic-design.md 一致
export const PHASES = {
  awakenEnd: 1.2,
  descentEnd: 4.0,
  guardianEnd: 6.5,
  unfoldEnd: 8.5,
  decryptEnd: 10.0,
  total: 11.0,
} as const;

// 「青 / 紫 / 金」三色相体系；值为 "r, g, b" 便于 rgba() 拼接
export const INK = {
  cyan: "125, 211, 252",
  iceCyan: "165, 243, 252",
  violet: "192, 132, 252",
  pinkViolet: "240, 171, 252",
  gold: "255, 202, 133",
  white: "224, 247, 255",
} as const;

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
/** t 落在 [a,b] 的归一化进度 */
export const segment = (t: number, a: number, b: number) => (b === a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));
export const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
