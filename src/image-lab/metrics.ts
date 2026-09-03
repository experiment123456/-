// 潜光实验舱 · 图像质量与差分度量

// 峰值信噪比（RGB，越高越接近原图；完全相同返回 Infinity）。
export function psnr(a: ImageData, b: ImageData): number {
  const pa = a.data;
  const pb = b.data;
  let mse = 0;
  let count = 0;
  for (let i = 0; i < pa.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const diff = pa[i + channel] - pb[i + channel];
      mse += diff * diff;
      count += 1;
    }
  }
  mse /= count;
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

// 统计被 LSB 改动的像素数量与占比。
export function changedPixels(a: ImageData, b: ImageData): { changed: number; ratio: number } {
  const pa = a.data;
  const pb = b.data;
  let changed = 0;
  const totalPixels = a.width * a.height;
  for (let i = 0; i < pa.length; i += 4) {
    if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) changed += 1;
  }
  return { changed, ratio: totalPixels ? changed / totalPixels : 0 };
}

// 生成差分热力图：LSB 改动仅 ±1，肉眼不可见，故大幅增益着色（深底 → 青 → 黄 → 红）。
// 只要该像素被改动就直接抬到高对比暖色，避免「几乎纯黑看不见」。
export function diffHeatmap(a: ImageData, b: ImageData): ImageData {
  const pa = a.data;
  const pb = b.data;
  const out = new Uint8ClampedArray(pa.length);
  for (let i = 0; i < pa.length; i += 4) {
    const magnitude = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
    if (magnitude === 0) {
      out[i] = 3; out[i + 1] = 18; out[i + 2] = 34; out[i + 3] = 255; // 深海底色
    } else {
      // magnitude 通常为 1~3；映射到 0.55~1，确保任何改动都清晰可见。
      const t = Math.min(1, 0.55 + magnitude / 6);
      out[i] = Math.round(40 + 215 * t);      // R 随强度上升
      out[i + 1] = Math.round(210 - 90 * t);  // G
      out[i + 2] = Math.round(150 * (1 - t)); // B 随强度下降
      out[i + 3] = 255;
    }
  }
  return new ImageData(out, a.width, a.height);
}
