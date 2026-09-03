// 潜光实验舱 · 简化隐写分析（Steganalysis）
// 说明：这不是加密算法，而是「检测图片是否可能藏有 LSB 隐写数据」。
// 原理：自然图像相邻取值对 (2k, 2k+1) 的直方图并不相等；一旦嵌入随机密文，
// LSB 被均匀化，成对取值趋于相等 —— 即经典的卡方 PoV（Pairs of Values）攻击。

export interface StegoAnalysis {
  score: number; // 0–100 可疑分，越高越像被隐写
  chiSquare: number; // 卡方统计量
  reduced: number; // 约化卡方 chi/df
  lsbRatio: number; // LSB 为 1 的比例（嵌入后趋近 0.5）
  verdict: string;
}

export function analyzeLsb(data: ImageData): StegoAnalysis {
  const hist = new Float64Array(256);
  const px = data.data;
  let ones = 0;
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = px[i + channel];
      hist[value] += 1;
      if (value & 1) ones += 1;
      total += 1;
    }
  }

  let chiSquare = 0;
  let df = 0;
  for (let k = 0; k < 128; k += 1) {
    const a = hist[2 * k];
    const b = hist[2 * k + 1];
    const expected = (a + b) / 2;
    if (expected >= 1) {
      chiSquare += ((a - expected) * (a - expected)) / expected;
      df += 1;
    }
  }

  const reduced = df > 0 ? chiSquare / df : 0;
  // 成对取值越相等（约化卡方越小）→ 越可疑，分数越高。
  const score = Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-reduced / 2))));
  const lsbRatio = total > 0 ? ones / total : 0;
  const verdict = score >= 70
    ? "高度可疑：LSB 分布高度均衡，疑似含隐写数据"
    : score >= 40
      ? "可疑：LSB 分布偏均衡，建议进一步核查"
      : "正常：未见明显 LSB 隐写特征";
  return { score, chiSquare, reduced, lsbRatio, verdict };
}
