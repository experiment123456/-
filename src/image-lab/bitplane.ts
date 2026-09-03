// 隐写攻防 · LSB 位平面可视化（Bit Plane Slicing）
// 目的：把「肉眼看不见的 ±1 LSB 改动」放大成论文级别的可读图。
//  - bitPlane：把某一位（0=LSB … 7=MSB）单独抽出成黑白图；低位是噪声，高位是结构。
//  - lsbXor：cover ⊕ stego 的最低位，直接高亮被嵌入的像素（隐写痕迹的「铁证」）。

function grayAt(px: Uint8ClampedArray, i: number): number {
  return Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
}

// 单个灰度位平面（bit 0..7），输出黑白 ImageData。
export function bitPlane(data: ImageData, bit: number): ImageData {
  const px = data.data;
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const g = grayAt(px, i);
    const on = (g >> bit) & 1 ? 255 : 0;
    out[i] = out[i + 1] = out[i + 2] = on;
    out[i + 3] = 255;
  }
  return new ImageData(out, data.width, data.height);
}

// cover 与 stego 的 LSB 异或：任一通道最低位不同即判为「改动」，高亮成 accent 色，
// 并做 1px 膨胀，让稀疏的嵌入痕迹在缩略图里也能看清。
export function lsbXor(
  a: ImageData,
  b: ImageData,
  accent: [number, number, number] = [125, 211, 252],
): ImageData {
  const pa = a.data;
  const pb = b.data;
  const w = a.width;
  const h = a.height;
  const changed = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    const diff =
      ((pa[i] ^ pb[i]) & 1) |
      ((pa[i + 1] ^ pb[i + 1]) & 1) |
      ((pa[i + 2] ^ pb[i + 2]) & 1);
    changed[p] = diff ? 1 : 0;
  }

  const out = new Uint8ClampedArray(pa.length);
  const [ar, ag, ab] = accent;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      let on = changed[p];
      if (!on) {
        if (x > 0 && changed[p - 1]) on = 1;
        else if (x < w - 1 && changed[p + 1]) on = 1;
        else if (y > 0 && changed[p - w]) on = 1;
        else if (y < h - 1 && changed[p + w]) on = 1;
      }
      const i = p * 4;
      if (on) {
        out[i] = ar; out[i + 1] = ag; out[i + 2] = ab; out[i + 3] = 255;
      } else {
        out[i] = 3; out[i + 1] = 10; out[i + 2] = 20; out[i + 3] = 255;
      }
    }
  }
  return new ImageData(out, w, h);
}

// 统计被改动的像素数量（用于文案提示）。
export function countChangedPixels(a: ImageData, b: ImageData): number {
  const pa = a.data;
  const pb = b.data;
  let count = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (((pa[i] ^ pb[i]) & 1) || ((pa[i + 1] ^ pb[i + 1]) & 1) || ((pa[i + 2] ^ pb[i + 2]) & 1)) count += 1;
  }
  return count;
}

// 位平面用的降采样：位平面是「示意/教学」可视化，降采样后仍能体现
// 「高位有结构、低位是噪声」，同时避免 8 张全分辨率画布的内存开销。
export function downscaleImageData(src: ImageData, max = 480): ImageData {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  if (scale >= 1) return src;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  tmp.getContext("2d")!.putImageData(src, 0, 0);
  const dst = document.createElement("canvas");
  dst.width = w;
  dst.height = h;
  const dctx = dst.getContext("2d")!;
  dctx.drawImage(tmp, 0, 0, w, h);
  return dctx.getImageData(0, 0, w, h);
}
