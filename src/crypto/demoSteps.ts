import {
  UTF8_CIPHER_PREFIX,
  aesDecryptBytes,
  aesEncryptBytes,
  bytesToBase64,
  bytesToHex,
  decodeUtf8,
  hexToBytes,
  md5,
  sm2Decrypt,
  sm2Encrypt,
  utf8,
  type AlgorithmId,
  type CipherMode,
} from "./engine";

/**
 * 算法过程演示：按当前输入、密钥与模式生成逐步演算数据。
 * 文件内的核心运算与 src/crypto/engine.ts 的实现保持一致（追踪版），
 * 修改 engine.ts 中的算法逻辑时请同步更新此处。
 */

export type DemoCell = string | { text: string; hl?: boolean; dim?: boolean };

export interface DemoTable {
  head?: string[];
  rows: DemoCell[][];
  caption?: string;
}

export interface DemoStep {
  title: string;
  description?: string;
  formula?: string;
  kv?: [string, string][];
  table?: DemoTable;
  pre?: string;
  note?: string;
}

export interface DemoRequest {
  algorithm: AlgorithmId;
  mode: CipherMode;
  input: string;
  key?: string;
  secondKey?: string;
}

type ClassicalId = "multiliteral" | "autokey" | "playfair" | "double";

const TRACE_LIMIT = 10;
const PAIR_TRACE_LIMIT = 8;

const dim = (text: string): DemoCell => ({ text, dim: true });
const hl = (text: string): DemoCell => ({ text, hl: true });

function clip(value: string, max: number): string {
  const characters = Array.from(value);
  return characters.length > max ? `${characters.slice(0, max).join("")}…（共 ${characters.length} 字符）` : value;
}

const ab = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

function hex8(value: number): string {
  return value.toString(16).padStart(8, "0");
}

function visibleByte(byte: number): string {
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : "·";
}

function hexDump(bytes: Uint8Array, perLine = 16, maxLines = 8): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length && lines.length < maxLines; offset += perLine) {
    const hex = Array.from(bytes.slice(offset, offset + perLine), (byte) => byte.toString(16).padStart(2, "0")).join(" ");
    lines.push(`${offset.toString(16).padStart(4, "0")}  ${hex}`);
  }
  if (bytes.length > maxLines * perLine) lines.push(`…（共 ${bytes.length} 字节）`);
  return lines.join("\n");
}

function requireKeyDemo(key?: string): string {
  if (!key?.trim()) throw new Error("请先输入或生成密钥");
  return key.trim();
}

// ---- 以下基本运算与 src/crypto/engine.ts 保持一致（演示用镜像实现） ----

const MULTILITERAL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function keyedAlphabet(key: string, alphabet: string): string {
  const allowed = new Set(alphabet);
  const unique: string[] = [];
  for (const character of `${key.toUpperCase()}${alphabet}`) {
    if (allowed.has(character) && !unique.includes(character)) unique.push(character);
  }
  return unique.join("");
}

function normalizeLetters(value: string): number[] {
  return Array.from(value.toUpperCase())
    .filter((character) => /[A-Z]/.test(character))
    .map((character) => character.charCodeAt(0) - 65);
}

function multiliteralEncryptFull(input: string, key: string): string {
  const square = keyedAlphabet(key, MULTILITERAL_ALPHABET);
  return Array.from(input.toUpperCase(), (character) => {
    if (/\s/.test(character)) return "/";
    const index = square.indexOf(character);
    if (index < 0) return `[${character}]`;
    return `${Math.floor(index / 6) + 1}${(index % 6) + 1}`;
  }).join(" ");
}

function multiliteralDecryptFull(input: string, key: string): string {
  const square = keyedAlphabet(key, MULTILITERAL_ALPHABET);
  return input
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (token === "/") return " ";
      const literal = token.match(/^\[(.*)]$/);
      if (literal) return literal[1];
      if (!/^[1-6]{2}$/.test(token)) throw new Error(`坐标“${token}”无效，应为 11–66`);
      const index = (Number(token[0]) - 1) * 6 + Number(token[1]) - 1;
      return square[index];
    })
    .join("");
}

function autokeyFull(input: string, key: string, decrypting: boolean): string {
  const initial = normalizeLetters(key);
  if (!initial.length) throw new Error("Autokey 初始关键字至少需要一个英文字母");
  const feedback: number[] = [];
  let position = 0;
  return Array.from(input)
    .map((character) => {
      if (!/[A-Za-z]/.test(character)) return character;
      const source = character.toUpperCase().charCodeAt(0) - 65;
      const shift = position < initial.length ? initial[position] : feedback[position - initial.length];
      const result = decrypting ? (source - shift + 26) % 26 : (source + shift) % 26;
      feedback.push(decrypting ? source : result);
      position += 1;
      const output = String.fromCharCode(65 + result);
      return character === character.toLowerCase() ? output.toLowerCase() : output;
    })
    .join("");
}

function playfairSquareOf(key: string): string {
  return keyedAlphabet(key.toUpperCase().replaceAll("J", "I"), "ABCDEFGHIKLMNOPQRSTUVWXYZ");
}

function playfairPairsOf(input: string): string[][] {
  const letters = Array.from(input.toUpperCase().replaceAll("J", "I")).filter((character) => /[A-Z]/.test(character));
  const pairs: string[][] = [];
  let index = 0;
  while (index < letters.length) {
    const first = letters[index];
    const second = letters[index + 1];
    if (!second) {
      pairs.push([first, "X"]);
      index += 1;
    } else if (first === second) {
      pairs.push([first, first === "X" ? "Q" : "X"]);
      index += 1;
    } else {
      pairs.push([first, second]);
      index += 2;
    }
  }
  return pairs;
}

function playfairFull(input: string, key: string, decrypting: boolean): string {
  const square = playfairSquareOf(key);
  let compact = Array.from(input.toUpperCase().replaceAll("J", "I")).filter((character) => /[A-Z]/.test(character));
  if (decrypting && compact.length % 2 !== 0) throw new Error("Playfair 密文必须包含偶数个字母");
  const pairs = decrypting
    ? Array.from({ length: compact.length / 2 }, (_, index) => compact.slice(index * 2, index * 2 + 2))
    : playfairPairsOf(input);
  const direction = decrypting ? -1 : 1;
  return pairs
    .map(([first, second]) => {
      const a = square.indexOf(first);
      const b = square.indexOf(second);
      const ar = Math.floor(a / 5);
      const ac = a % 5;
      const br = Math.floor(b / 5);
      const bc = b % 5;
      if (ar === br) {
        return square[ar * 5 + ((ac + direction + 5) % 5)] + square[br * 5 + ((bc + direction + 5) % 5)];
      }
      if (ac === bc) {
        return square[((ar + direction + 5) % 5) * 5 + ac] + square[((br + direction + 5) % 5) * 5 + bc];
      }
      return square[ar * 5 + bc] + square[br * 5 + ac];
    })
    .join("");
}

function columnOrderOf(key: string): number[] {
  return Array.from(key)
    .map((character, index) => ({ character, index }))
    .sort((left, right) => left.character.localeCompare(right.character) || left.index - right.index)
    .map(({ index }) => index);
}

function columnarEncryptOf(input: string, key: string): string {
  const chars = Array.from(input);
  const width = Array.from(key).length;
  const order = columnOrderOf(key);
  let output = "";
  order.forEach((column) => {
    for (let index = column; index < chars.length; index += width) output += chars[index];
  });
  return output;
}

function columnarDecryptOf(input: string, key: string): string {
  const chars = Array.from(input);
  const width = Array.from(key).length;
  const rows = Math.ceil(chars.length / width);
  const remainder = chars.length % width;
  const order = columnOrderOf(key);
  const columns: string[][] = Array.from({ length: width }, () => []);
  let offset = 0;
  order.forEach((column) => {
    const length = remainder === 0 || column < remainder ? rows : rows - 1;
    columns[column] = chars.slice(offset, offset + length);
    offset += length;
  });
  let output = "";
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < width; column += 1) output += columns[column][row] ?? "";
  }
  return output;
}

// No J (Playfair merges it) or X (reserved exclusively for Playfair padding).
const BYTE_LETTERS = "ABCDEFGHIKLMNOPQ";

function encodeByteLettersOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => BYTE_LETTERS[byte >>> 4] + BYTE_LETTERS[byte & 15]).join("");
}

function decodeByteLettersOf(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length / 2);
  for (let index = 0; index < input.length; index += 2) {
    const high = BYTE_LETTERS.indexOf(input[index]);
    const low = BYTE_LETTERS.indexOf(input[index + 1]);
    if (high < 0 || low < 0) throw new Error("扩展密文包含无效的字节编码");
    bytes[index / 2] = (high << 4) | low;
  }
  return bytes;
}

function extensionKeyOf(algorithm: ClassicalId, key: string): string {
  if (/[^\x00-\x7f]/.test(key) || (algorithm !== "double" && !/[A-Za-z]/.test(key))) {
    return encodeByteLettersOf(hexToBytes(md5(key)));
  }
  return key;
}

function needsUtf8ExtensionOf(algorithm: ClassicalId, input: string, key: string, secondKey: string): boolean {
  if (input.startsWith(UTF8_CIPHER_PREFIX) || /[^\x00-\x7f]/.test(input + key + secondKey)) return true;
  if (algorithm === "multiliteral") return !/^[A-Z0-9 ]+$/.test(input);
  if (algorithm === "autokey") return !/[A-Za-z]/.test(input) || !/[A-Za-z]/.test(key);
  if (algorithm === "playfair") return playfairPairsOf(input).flat().join("") !== input;
  return input.length < Math.max(key.length, secondKey.length);
}

function concatBytesOf(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function classicalTransformOf(algorithm: ClassicalId, input: string, key: string, secondKey: string, decrypting: boolean): string {
  switch (algorithm) {
    case "multiliteral": return decrypting ? multiliteralDecryptFull(input, key) : multiliteralEncryptFull(input, key);
    case "autokey": return autokeyFull(input, key, decrypting);
    case "playfair": return playfairFull(input, key, decrypting);
    case "double": return decrypting
      ? columnarDecryptOf(columnarDecryptOf(input, secondKey), key)
      : columnarEncryptOf(columnarEncryptOf(input, key), secondKey);
  }
}

interface ClassicalContext {
  result: string;
  extension: boolean;
  core: string;
  keyEff: string;
  secondEff: string;
  plainBytes?: number;
}

function classicalContext(algorithm: ClassicalId, mode: CipherMode, input: string, key?: string, secondKey?: string): ClassicalContext {
  const first = requireKeyDemo(key);
  const second = algorithm === "double" ? requireKeyDemo(secondKey) : "";
  if (mode === "decrypt" && input.startsWith(UTF8_CIPHER_PREFIX)) {
    const match = /^LUMORA-UTF8-V1:([a-z]+):([\s\S]+)$/.exec(input);
    if (!match || match[1] !== algorithm) throw new Error("UTF-8 扩展密文与所选算法不匹配，或密文不完整");
    const keyEff = extensionKeyOf(algorithm, first);
    const secondEff = extensionKeyOf(algorithm, second);
    try {
      let decoded = classicalTransformOf(algorithm, match[2], keyEff, secondEff, true);
      if (algorithm === "playfair") decoded = decoded.replaceAll("X", "");
      const framed = decodeByteLettersOf(decoded);
      if (framed.length < 17) throw new Error("缺少数据");
      const bytes = framed.slice(16);
      if (bytesToHex(framed.slice(0, 16)) !== md5(bytes)) throw new Error("校验不一致");
      return {
        result: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        extension: true,
        core: match[2],
        keyEff,
        secondEff,
        plainBytes: bytes.length,
      };
    } catch {
      throw new Error("UTF-8 扩展解密失败：密钥错误或密文已被修改/截断");
    }
  }
  if (mode === "encrypt" && needsUtf8ExtensionOf(algorithm, input, first, second)) {
    const bytes = utf8(input);
    const prepared = encodeByteLettersOf(concatBytesOf(hexToBytes(md5(bytes)), bytes));
    const keyEff = extensionKeyOf(algorithm, first);
    const secondEff = extensionKeyOf(algorithm, second);
    const cipher = classicalTransformOf(algorithm, prepared, keyEff, secondEff, false);
    return { result: `${UTF8_CIPHER_PREFIX}${algorithm}:${cipher}`, extension: true, core: prepared, keyEff, secondEff };
  }
  return {
    result: classicalTransformOf(algorithm, input, first, second, mode === "decrypt"),
    extension: false,
    core: input,
    keyEff: first,
    secondEff: second,
  };
}

function extensionIntroStep(algorithm: ClassicalId, context: ClassicalContext, raw: string, decrypting: boolean): DemoStep {
  const mapping = `${clip(context.keyEff, 20)}${context.secondEff && context.secondEff !== context.keyEff ? ` / ${clip(context.secondEff, 12)}` : ""}`;
  if (decrypting) {
    return {
      title: "识别 UTF-8 全字符扩展密文",
      description: "密文带有 LUMORA-UTF8-V1 前缀：核心算法先还原出「MD5 校验 + 字节」的字母编码流，再反向解码出原始 UTF-8 文本。",
      kv: [
        ["密文前缀", `${UTF8_CIPHER_PREFIX}${algorithm}:`],
        ["字母编码流", clip(context.core, 44)],
        ["密钥字母映射", mapping],
      ],
    };
  }
  const rawBytes = utf8(raw);
  return {
    title: "启用 UTF-8 全字符扩展",
    description: "输入包含中文/Emoji 或超出古典字母范围：先取 UTF-8 字节并前置 16 字节 MD5 校验，再把每个字节映射为两个字母（17 个字母编码 0–15），随后对字母流执行核心算法。",
    kv: [
      ["原文", clip(raw, 24)],
      ["UTF-8 字节数", `${rawBytes.length} 字节`],
      ["MD5 校验", `${clip(md5(rawBytes), 24)}…`],
      ["字节 → 字母示例", encodeByteLettersOf(rawBytes.slice(0, 8))],
      ["密钥字母映射", mapping],
    ],
    note: `完整密文会带上前缀 ${UTF8_CIPHER_PREFIX}${algorithm}:`,
  };
}

function resultStep(context: ClassicalContext, decrypting: boolean): DemoStep {
  return {
    title: decrypting ? "输出明文" : "输出密文",
    pre: clip(context.result, 480),
    kv: [
      [decrypting ? "明文长度" : "密文长度", `${Array.from(context.result).length} 字符`],
      ...(context.extension && decrypting ? [["UTF-8 字节", `${context.plainBytes ?? 0} 字节（MD5 校验一致 ✓）`] as [string, string]] : []),
    ],
    note: decrypting ? undefined : "与上方「执行加密」的结果一致，可直接复制验证。",
  };
}

// ---- Multiliteral ----

function multiliteralSquareStep(square: string, key: string): DemoStep {
  const rows: DemoCell[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const cells: DemoCell[] = [dim(String(row + 1))];
    for (let column = 0; column < 6; column += 1) cells.push(square[row * 6 + column]);
    rows.push(cells);
  }
  return {
    title: "构建 6 × 6 密钥方阵",
    description: "把密钥字母去重后写入方阵开头，再按 A–Z、0–9 顺序补全剩余格子。加密查表得「行号+列号」两位坐标，解密反查坐标得字符。",
    kv: [["方阵密钥", clip(key, 36)], ["基础字母表", MULTILITERAL_ALPHABET]],
    table: { head: ["行\\列", "1", "2", "3", "4", "5", "6"], rows, caption: "密钥方阵" },
  };
}

function demoMultiliteral(request: DemoRequest): DemoStep[] {
  const decrypting = request.mode === "decrypt";
  const context = classicalContext("multiliteral", request.mode, request.input, request.key, request.secondKey);
  const square = keyedAlphabet(context.keyEff, MULTILITERAL_ALPHABET);
  const steps: DemoStep[] = [];
  if (context.extension) steps.push(extensionIntroStep("multiliteral", context, request.input, decrypting));
  steps.push(multiliteralSquareStep(square, context.keyEff));

  if (!decrypting) {
    const characters = Array.from(context.core.toUpperCase());
    const tokens: string[] = [];
    characters.slice(0, TRACE_LIMIT).forEach((character, index) => {
      let coordinate: string;
      let explanation: string;
      if (/\s/.test(character)) {
        coordinate = "/";
        explanation = "空白字符 → 记作 “/”";
      } else {
        const position = square.indexOf(character);
        if (position < 0) {
          coordinate = `[${character}]`;
          explanation = "不在方阵中 → 原样保留";
        } else {
          coordinate = `${Math.floor(position / 6) + 1}${(position % 6) + 1}`;
          explanation = `方阵第 ${Math.floor(position / 6) + 1} 行 · 第 ${(position % 6) + 1} 列`;
        }
      }
      tokens.push(coordinate);
      steps.push({
        title: `编码 “${character}” → ${coordinate}`,
        kv: [
          ["当前字符", character],
          ["查表结果", explanation],
          ["累计密文", clip(tokens.join(" "), 72)],
        ],
      });
    });
    if (characters.length > TRACE_LIMIT) {
      steps.push({ title: `其余 ${characters.length - TRACE_LIMIT} 个字符`, description: "按同样规则逐字符查表编码。" });
    }
  } else {
    const tokens = context.core.trim().split(/\s+/).filter(Boolean);
    let plain = "";
    tokens.slice(0, TRACE_LIMIT).forEach((token, index) => {
      let character: string;
      let explanation: string;
      if (token === "/") {
        character = "␠";
        explanation = "“/” → 空格";
      } else {
        const literal = token.match(/^\[(.*)]$/);
        if (literal) {
          character = literal[1];
          explanation = "原样保留字符";
        } else {
          if (!/^[1-6]{2}$/.test(token)) throw new Error(`坐标“${token}”无效，应为 11–66`);
          const position = (Number(token[0]) - 1) * 6 + Number(token[1]) - 1;
          character = square[position];
          explanation = `坐标 ${token} → 方阵第 ${token[0]} 行第 ${token[1]} 列`;
        }
      }
      plain += token === "/" ? " " : character;
      steps.push({
        title: `译码 “${token}” → ${character}`,
        kv: [
          ["当前坐标", token],
          ["查表结果", explanation],
          ["累计明文", clip(plain, 72)],
        ],
      });
    });
    if (tokens.length > TRACE_LIMIT) {
      steps.push({ title: `其余 ${tokens.length - TRACE_LIMIT} 个坐标`, description: "按同样规则反查方阵译码。" });
    }
  }
  steps.push(resultStep(context, decrypting));
  return steps;
}

// ---- Autokey ----

function demoAutokey(request: DemoRequest): DemoStep[] {
  const decrypting = request.mode === "decrypt";
  const context = classicalContext("autokey", request.mode, request.input, request.key, request.secondKey);
  const steps: DemoStep[] = [];
  if (context.extension) steps.push(extensionIntroStep("autokey", context, request.input, decrypting));

  const initial = normalizeLetters(context.keyEff);
  if (!initial.length) throw new Error("Autokey 初始关键字至少需要一个英文字母");
  const keyword = initial.map((value) => String.fromCharCode(65 + value)).join("");
  steps.push({
    title: "准备初始关键字",
    description: `只保留英文字母并转大写。加密时密钥流 = 初始关键字，之后每一位都是刚刚生成的${decrypting ? "明文" : "密文"}字母（反馈）。`,
    kv: [
      ["有效关键字", keyword],
      ["关键字字母值", initial.join(" · ")],
      ["反馈方向", decrypting ? "解密：反馈明文字母" : "加密：反馈密文字母"],
    ],
  });

  const feedback: number[] = [];
  let position = 0;
  let out = "";
  let traced = 0;
  for (const character of Array.from(context.core)) {
    if (!/[A-Za-z]/.test(character)) {
      out += character;
      continue;
    }
    if (traced >= TRACE_LIMIT) break;
    const source = character.toUpperCase().charCodeAt(0) - 65;
    const shift = position < initial.length ? initial[position] : feedback[position - initial.length];
    const result = decrypting ? (source - shift + 26) % 26 : (source + shift) % 26;
    feedback.push(decrypting ? source : result);
    position += 1;
    const output = String.fromCharCode(65 + result);
    const shown = character === character.toLowerCase() ? output.toLowerCase() : output;
    out += shown;
    traced += 1;
    steps.push({
      title: `字母 “${character}” → “${shown}”`,
      formula: decrypting ? `(${source} − ${shift} + 26) mod 26 = ${result}` : `(${source} + ${shift}) mod 26 = ${result}`,
      kv: [
        [decrypting ? "密文字母" : "明文字母", `${character.toUpperCase()}（值 ${source}）`],
        ["密钥字母", `${String.fromCharCode(65 + shift)}（值 ${shift}，${position <= initial.length ? "初始关键字" : "反馈密钥流"}）`],
        ["累计输出", clip(out, 72)],
      ],
    });
  }
  if (Array.from(context.core).filter((character) => /[A-Za-z]/.test(character)).length > TRACE_LIMIT) {
    steps.push({ title: "其余字母", description: "按同样规则移位，并继续把新生成的字母拼入密钥流。" });
  }
  steps.push({
    title: "密钥流全貌",
    description: decrypting
      ? "解密的密钥流由「初始关键字 + 已还原的明文字母」组成，与加密端完全一致。"
      : "加密的密钥流由「初始关键字 + 已生成的密文字母」组成，这就是 Autokey 的密文反馈特性。",
    kv: [["完整密钥流", clip([...initial, ...feedback].map((value) => String.fromCharCode(65 + value)).join(""), 72)]],
  });
  steps.push(resultStep(context, decrypting));
  return steps;
}

// ---- Playfair ----

const PLAYFAIR_POSITION = (square: string, letter: string) => ({ row: Math.floor(square.indexOf(letter) / 5) + 1, column: (square.indexOf(letter) % 5) + 1 });

function demoPlayfair(request: DemoRequest): DemoStep[] {
  const decrypting = request.mode === "decrypt";
  const context = classicalContext("playfair", request.mode, request.input, request.key, request.secondKey);
  const square = playfairSquareOf(context.keyEff);
  const steps: DemoStep[] = [];
  if (context.extension) steps.push(extensionIntroStep("playfair", context, request.input, decrypting));

  const matrixRows: DemoCell[][] = [];
  for (let row = 0; row < 5; row += 1) {
    const cells: DemoCell[] = [dim(String(row + 1))];
    for (let column = 0; column < 5; column += 1) cells.push(square[row * 5 + column]);
    matrixRows.push(cells);
  }
  steps.push({
    title: "构建 5 × 5 Playfair 矩阵",
    description: "关键字去重后填入矩阵，剩余位置按字母表补全；字母 J 并入 I，因此 25 个格子恰好放满 26 个字母。",
    kv: [
      ["矩阵关键字", clip(context.keyEff, 36)],
      ["字母表", "A B C D E F G H I K L M N O P Q R S T U V W X Y Z（无 J）"],
    ],
    table: { head: ["行\\列", "1", "2", "3", "4", "5"], rows: matrixRows, caption: "Playfair 矩阵" },
  });

  const pairs = decrypting
    ? (Array.from(context.core.toUpperCase().replaceAll("J", "I")).filter((character) => /[A-Z]/.test(character)) as string[]).reduce<string[][]>((acc, letter, index) => {
        if (index % 2 === 0) acc.push([letter]);
        else acc[acc.length - 1].push(letter);
        return acc;
      }, [])
    : playfairPairsOf(context.core);

  if (!decrypting) {
    // 重放分组过程，为每组记录准确的说明（镜像 engine 的 playfairPairs 规则）。
    const letters = Array.from(context.core.toUpperCase().replaceAll("J", "I")).filter((character) => /[A-Z]/.test(character));
    const annotated: { pair: string[]; note: string }[] = [];
    let index = 0;
    while (index < letters.length) {
      const first = letters[index];
      const second = letters[index + 1];
      if (!second) {
        annotated.push({ pair: [first, "X"], note: "末尾落单 → 补 X" });
        index += 1;
      } else if (first === second) {
        annotated.push({ pair: [first, first === "X" ? "Q" : "X"], note: `重复字母 → 插入 ${first === "X" ? "Q" : "X"}` });
        index += 1;
      } else {
        annotated.push({ pair: [first, second], note: "正常分组" });
        index += 2;
      }
    }
    steps.push({
      title: "明文两两分组",
      description: "把字母流按两个一组拆分；同组重复的字母之间插入 X（X 自身重复则插 Q），末尾落单补 X。",
      table: {
        head: ["组", "明文对", "说明"],
        rows: annotated
          .slice(0, PAIR_TRACE_LIMIT)
          .map((item, position) => [String(position + 1), item.pair.join(" "), item.note] as DemoCell[])
          .concat(
            annotated.length > PAIR_TRACE_LIMIT
              ? [[dim("…"), dim(`其余 ${annotated.length - PAIR_TRACE_LIMIT} 组`), dim("按同样规则处理")] as DemoCell[]]
              : [],
          ),
        caption: `共 ${annotated.length} 组`,
      },
    });
  }

  const direction = decrypting ? -1 : 1;
  let out = "";
  pairs.slice(0, PAIR_TRACE_LIMIT).forEach(([first, second], index) => {
    const a = square.indexOf(first);
    const b = square.indexOf(second);
    const ar = Math.floor(a / 5);
    const ac = a % 5;
    const br = Math.floor(b / 5);
    const bc = b % 5;
    let pair: string;
    let rule: string;
    if (ar === br) {
      pair = square[ar * 5 + ((ac + direction + 5) % 5)] + square[br * 5 + ((bc + direction + 5) % 5)];
      rule = `同一行 → 整体${decrypting ? "左" : "右"}移一位`;
    } else if (ac === bc) {
      pair = square[((ar + direction + 5) % 5) * 5 + ac] + square[((br + direction + 5) % 5) * 5 + bc];
      rule = `同一列 → 整体${decrypting ? "上" : "下"}移一位`;
    } else {
      pair = square[ar * 5 + bc] + square[br * 5 + ac];
      rule = "不同行列 → 取矩形对角（交换列）";
    }
    out += pair;
    const firstPos = PLAYFAIR_POSITION(square, first);
    const secondPos = PLAYFAIR_POSITION(square, second);
    steps.push({
      title: `第 ${index + 1} 组 “${first}${second}” → “${pair}”`,
      kv: [
        [decrypting ? "密文对" : "明文对", `${first}（${firstPos.row},${firstPos.column}） · ${second}（${secondPos.row},${secondPos.column}）`],
        ["应用规则", rule],
        [decrypting ? "明文对" : "密文对", pair],
        ["累计输出", clip(out, 72)],
      ],
    });
  });
  if (pairs.length > PAIR_TRACE_LIMIT) {
    steps.push({ title: `其余 ${pairs.length - PAIR_TRACE_LIMIT} 组`, description: "按同样规则查矩阵替换。" });
  }
  steps.push(resultStep(context, decrypting));
  if (context.extension && decrypting) {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      note: "扩展解密在替换后移除全部填充字母 X，再反解字节流并通过 MD5 校验。",
    };
  }
  return steps;
}

// ---- Double transposition ----

function columnOrderStep(title: string, key: string): DemoStep {
  const keyChars = Array.from(key);
  const order = columnOrderOf(key);
  const positionOf = new Map<number, number>();
  order.forEach((column, position) => positionOf.set(column, position));
  return {
    title,
    description: "把密钥字符按字典序（相同字符按位置）排序，字符越小越先读取，得到列的读取顺序。",
    kv: [["列读取顺序", order.map((column) => column + 1).join(" → ")]],
    table: {
      head: ["", ...keyChars.map((_, index) => `列 ${index + 1}`)],
      rows: [
        [dim("密钥字符"), ...keyChars],
        [dim("读取位次"), ...keyChars.map((_, index) => hl(String((positionOf.get(index) ?? 0) + 1)))],
      ],
    },
  };
}

function gridTable(text: string, key: string, maxRows = 8, maxCols = 16): DemoTable {
  const chars = Array.from(text);
  const keyChars = Array.from(key);
  const width = keyChars.length;
  const totalRows = Math.ceil(chars.length / width);
  const shownRows = Math.min(totalRows, maxRows);
  const shownCols = Math.min(width, maxCols);
  const rows: DemoCell[][] = [];
  for (let row = 0; row < shownRows; row += 1) {
    const cells: DemoCell[] = [dim(String(row + 1))];
    for (let column = 0; column < shownCols; column += 1) {
      const value = chars[row * width + column];
      cells.push(value ? { text: value, dim: false } : dim("·"));
    }
    rows.push(cells);
  }
  const truncated = totalRows > shownRows || width > shownCols;
  return {
    head: ["行", ...keyChars.slice(0, shownCols).map((character, index) => `${character}(${index + 1})`)],
    rows,
    caption: `宽度 = 密钥长度 ${width}${truncated ? `（仅展示前 ${shownRows} 行 × ${shownCols} 列）` : `，共 ${totalRows} 行`}`,
  };
}

function backFillGridTable(cipher: string, key: string, maxRows = 8, maxCols = 16): DemoTable {
  const chars = Array.from(cipher);
  const keyChars = Array.from(key);
  const width = keyChars.length;
  const rows = Math.ceil(chars.length / width);
  const remainder = chars.length % width;
  const order = columnOrderOf(key);
  const columns: string[][] = Array.from({ length: width }, () => []);
  let offset = 0;
  order.forEach((column) => {
    const length = remainder === 0 || column < remainder ? rows : rows - 1;
    columns[column] = chars.slice(offset, offset + length);
    offset += length;
  });
  const shownRows = Math.min(rows, maxRows);
  const shownCols = Math.min(width, maxCols);
  const grid: DemoCell[][] = [];
  for (let row = 0; row < shownRows; row += 1) {
    const cells: DemoCell[] = [dim(String(row + 1))];
    for (let column = 0; column < shownCols; column += 1) {
      const value = columns[column][row];
      cells.push(value ? { text: value, dim: false } : dim("·"));
    }
    grid.push(cells);
  }
  const truncated = rows > shownRows || width > shownCols;
  return {
    head: ["行", ...keyChars.slice(0, shownCols).map((character, index) => `${character}(${index + 1})`)],
    rows: grid,
    caption: `按读取顺序把密文逐列回填${truncated ? `（仅展示前 ${shownRows} 行 × ${shownCols} 列）` : ""}，再按行读出`,
  };
}

function demoDouble(request: DemoRequest): DemoStep[] {
  const decrypting = request.mode === "decrypt";
  const context = classicalContext("double", request.mode, request.input, request.key, request.secondKey);
  const steps: DemoStep[] = [];
  if (context.extension) steps.push(extensionIntroStep("double", context, request.input, decrypting));

  if (!decrypting) {
    const firstPass = columnarEncryptOf(context.core, context.keyEff);
    const secondPass = columnarEncryptOf(firstPass, context.secondEff);
    steps.push(
      columnOrderStep("第一趟换位：密钥一的列顺序", context.keyEff),
      {
        title: "第一次列换位",
        description: "明文按密钥一长度逐行写入表格，再按列顺序一列一列读出，得到第一趟换位结果。",
        kv: [["第一趟输出", clip(firstPass, 72)]],
        table: gridTable(context.core, context.keyEff),
      },
      columnOrderStep("第二趟换位：密钥二的列顺序", context.secondEff),
      {
        title: "第二次列换位",
        description: "把第一趟结果当作新的“明文”，用密钥二再做一次列换位，读出即为最终密文。",
        kv: [["第二趟输出（最终密文）", clip(secondPass, 72)]],
        table: gridTable(firstPass, context.secondEff),
      },
    );
  } else {
    const firstPass = columnarDecryptOf(context.core, context.secondEff);
    const secondPass = columnarDecryptOf(firstPass, context.keyEff);
    steps.push(
      columnOrderStep("逆向第一趟：密钥二的列顺序", context.secondEff),
      {
        title: "第一次逆换位",
        description: "解密先撤销「最后一趟」换位：按密钥二的读取顺序把密文逐列回填表格，再按行读出。",
        kv: [["第一趟还原", clip(firstPass, 72)]],
        table: backFillGridTable(context.core, context.secondEff),
      },
      columnOrderStep("逆向第二趟：密钥一的列顺序", context.keyEff),
      {
        title: "第二次逆换位",
        description: "再用密钥一回填、按行读出，即还原出加密前的内容（扩展路径为字节编码流）。",
        kv: [["第二趟还原", clip(secondPass, 72)]],
        table: backFillGridTable(firstPass, context.keyEff),
      },
    );
  }
  steps.push(resultStep(context, decrypting));
  return steps;
}

// ---- CA / Rule 30 ----

function fnv1aOf(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function caKeystreamOf(length: number, seed: string): Uint8Array {
  let cells = fnv1aOf(seed) || 0xa5a5a5a5;
  const output = new Uint8Array(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const left = ((cells << 1) | (cells >>> 31)) >>> 0;
      const right = ((cells >>> 1) | (cells << 31)) >>> 0;
      cells = (left ^ (cells | right)) >>> 0;
      byte = (byte << 1) | (cells & 1);
    }
    output[byteIndex] = byte;
  }
  return output;
}

function xorBytesOf(input: Uint8Array, key: Uint8Array): Uint8Array {
  return Uint8Array.from(input, (byte, index) => byte ^ key[index]);
}

function base64ToBytesOf(value: string): Uint8Array {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Base64 密文格式不正确");
  }
}

function caGenerationStates(seed: number, count: number): number[] {
  const states: number[] = [seed >>> 0];
  let cells = seed >>> 0;
  for (let index = 0; index < count; index += 1) {
    const left = ((cells << 1) | (cells >>> 31)) >>> 0;
    const right = ((cells >>> 1) | (cells << 31)) >>> 0;
    cells = (left ^ (cells | right)) >>> 0;
    states.push(cells);
  }
  return states;
}

function caStateRow(state: number, previous?: number): DemoCell[] {
  return Array.from({ length: 32 }, (_, bit) => {
    const on = (state >>> (31 - bit)) & 1;
    const changed = previous !== undefined && ((previous >>> (31 - bit)) & 1) !== on;
    return on ? (changed ? hl("●") : { text: "●" }) : { text: "○", ...(changed ? {} : { dim: true }) };
  });
}

const RULE_30_PATTERN = ["111", "110", "101", "100", "011", "010", "001", "000"];
const RULE_30_OUTPUT = [0, 0, 0, 1, 1, 1, 1, 0];

function demoCa(request: DemoRequest): DemoStep[] {
  const decrypting = request.mode === "decrypt";
  const seedValue = requireKeyDemo(request.key);
  const bytes = decrypting ? base64ToBytesOf(request.input) : utf8(request.input);
  if (!bytes.length) throw new Error(decrypting ? "Base64 密文格式不正确" : "请输入待处理内容");
  const keystream = caKeystreamOf(bytes.length, seedValue);
  const mixed = xorBytesOf(bytes, keystream);
  const result = decrypting ? decodeUtf8(mixed) : bytesToBase64(mixed);

  const seed = fnv1aOf(seedValue) || 0xa5a5a5a5;
  const states = caGenerationStates(seed, 8);
  const rows: DemoCell[][] = states.map((state, index) => [dim(index === 0 ? "初始" : `第 ${index} 代`), ...caStateRow(state, index === 0 ? undefined : states[index - 1])]);

  const steps: DemoStep[] = [];
  if (decrypting) {
    steps.push({
      title: "解析 Base64 密文",
      description: "CA 加密的输出是 Base64 字符串；先还原成字节序列，再用同一条密钥流 XOR 还原明文。",
      kv: [["密文字节数", `${bytes.length} 字节`], ["需要密钥流", `${keystream.length} 字节`]],
    });
  }
  steps.push({
    title: "种子 → FNV-1a 初始状态",
    formula: "state = FNV-1a(种子)；全 0 时取 0xA5A5A5A5",
    description: "任意长度的种子被折算成 32 位初始元胞行（最左为最高位），作为元胞自动机的第 0 代。",
    kv: [
      ["种子", clip(seedValue, 32)],
      ["FNV-1a 状态", hex8(seed)],
      ["初始元胞", seed.toString(2).padStart(32, "0")],
    ],
  });
  steps.push({
    title: "Rule 30 演化规则",
    formula: "新元胞 = 左 ⊕ (中 OR 右)，两端环形折叠",
    description: "三个相邻元胞决定下一状态：● 为 1，○ 为 0。Rule 30 的真值表如下。",
    table: {
      head: ["左", "中", "右", "新元胞"],
      rows: RULE_30_PATTERN.map((pattern, index) => [pattern[0], pattern[1], pattern[2], hl(String(RULE_30_OUTPUT[index]))]),
      caption: "Rule 30（0b00011110 = 30）",
    },
  });
  steps.push({
    title: "演化元胞自动机",
    description: "每演化一次得到新的一行；每连续演化 8 次，把 8 个「最右侧元胞」按先后顺序（先到者为高位）拼成 1 个密钥流字节。",
    table: { head: ["代", ...Array.from({ length: 32 }, (_, index) => String(31 - index))], rows, caption: "前 8 次演化（高亮 = 与上一代不同）" },
  });
  steps.push({
    title: "提取密钥流",
    description: "对明文每个字节都要演化 8 次。下表是密钥流的前几个字节。",
    table: {
      head: ["字节序号", "二进制", "十六进制"],
      rows: Array.from({ length: Math.min(12, keystream.length) }, (_, index) => [
        String(index),
        keystream[index].toString(2).padStart(8, "0"),
        hl(keystream[index].toString(16).padStart(2, "0")),
      ]),
      caption: `共需 ${keystream.length} 字节密钥流`,
    },
  });
  const sampleLength = Math.min(8, bytes.length);
  steps.push({
    title: "逐字节 XOR 运算",
    formula: decrypting ? "P[i] = C[i] ⊕ KS[i]" : "C[i] = P[i] ⊕ KS[i]",
    table: {
      head: ["序号", decrypting ? "密文字节" : "明文字节", "密钥流", decrypting ? "明文字节" : "密文字节"],
      rows: Array.from({ length: sampleLength }, (_, index) => [
        String(index),
        `${bytes[index].toString(16).padStart(2, "0")}(${visibleByte(bytes[index])})`,
        keystream[index].toString(16).padStart(2, "0"),
        hl(`${mixed[index].toString(16).padStart(2, "0")}(${visibleByte(mixed[index])})`),
      ]),
    },
  });
  steps.push({
    title: decrypting ? "UTF-8 解码明文" : "Base64 编码输出",
    pre: clip(result, 480),
    kv: [[decrypting ? "明文长度" : "密文长度", decrypting ? `${Array.from(result).length} 字符` : `${result.length} 字符`]],
    note: "XOR 是对称运算：加密与解密使用完全相同的密钥流生成过程。",
  });
  return steps;
}

// ---- AES-256-GCM ----

async function deriveBitsForDemo(passphrase: string, salt: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("浏览器未开放 Web Crypto，无法演示 AES 派生过程");
  const material = await subtle.importKey("raw", ab(utf8(passphrase)), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: ab(salt), iterations: 120_000 }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function demoAes(request: DemoRequest): Promise<DemoStep[]> {
  const passphrase = requireKeyDemo(request.key);
  if (request.mode === "encrypt") {
    const payload = await aesEncryptBytes(utf8(request.input), passphrase);
    const all = base64ToBytesOf(payload);
    const salt = all.slice(0, 16);
    const iv = all.slice(16, 28);
    const body = all.slice(28);
    const derived = await deriveBitsForDemo(passphrase, salt);
    return [
      {
        title: "生成随机盐值与初始向量",
        description: "每次加密都重新随机生成 Salt 与 IV，因此相同明文每次得到的密文都不相同。",
        kv: [
          ["Salt（16 字节）", bytesToHex(salt)],
          ["IV（12 字节）", bytesToHex(iv)],
        ],
      },
      {
        title: "PBKDF2 派生 256 位会话密钥",
        formula: "DK = PBKDF2(HMAC-SHA256, 口令, Salt, 120000 轮) → 32 字节",
        description: "口令不适合直接做密钥：通过 12 万轮 PBKDF2 拉慢暴力破解，并派生出标准的 256 位 AES 密钥。",
        kv: [
          ["口令", clip(passphrase, 28)],
          ["迭代次数", "120,000"],
          ["派生密钥", derived],
        ],
      },
      {
        title: "AES-256-GCM 加密",
        description: "GCM = 计数器模式（CTR）逐块加密 + GHASH 认证：明文被分成 16 字节分组，与计数器密钥流 XOR；同时为密文计算 128 位认证标签，任何篡改都会让解密直接失败。",
        kv: [
          ["工作模式", "GCM（CTR + GHASH）"],
          ["IV", bytesToHex(iv)],
          ["认证标签", "128 位，附加在密文末尾"],
          ["密文体", `${body.length} 字节（含标签）`],
        ],
      },
      {
        title: "组装 Base64 载荷",
        description: "把 Salt、IV 与密文按固定顺序拼接后做 Base64 编码，解密端按同一结构拆分即可还原全部参数。",
        table: {
          head: ["字节区间", "内容", "长度", "十六进制"],
          rows: [
            ["0 – 15", "Salt 盐值", "16 字节", bytesToHex(salt)],
            ["16 – 27", "IV 初始向量", "12 字节", bytesToHex(iv)],
            ["28 – 末尾", "密文 + 认证标签", `${body.length} 字节`, clip(bytesToHex(body), 46)],
          ],
        },
        pre: clip(payload, 420),
        note: "与「执行加密」输出一致。",
      },
    ];
  }
  const all = base64ToBytesOf(request.input);
  if (all.length < 44) throw new Error("AES-GCM 密文长度不足");
  const salt = all.slice(0, 16);
  const iv = all.slice(16, 28);
  const body = all.slice(28);
  const derived = await deriveBitsForDemo(passphrase, salt);
  let plain = "";
  let plainError = "";
  try {
    plain = decodeUtf8(await aesDecryptBytes(request.input, passphrase));
  } catch (reason) {
    plainError = reason instanceof Error ? reason.message : "解密失败";
  }
  const steps: DemoStep[] = [
    {
      title: "解析 Base64 载荷",
      description: "按加密时的固定结构拆出 Salt、IV 与密文体。",
      table: {
        head: ["字节区间", "内容", "长度", "十六进制"],
        rows: [
          ["0 – 15", "Salt 盐值", "16 字节", bytesToHex(salt)],
          ["16 – 27", "IV 初始向量", "12 字节", bytesToHex(iv)],
          ["28 – 末尾", "密文 + 认证标签", `${body.length} 字节`, clip(bytesToHex(body), 46)],
        ],
      },
    },
    {
      title: "用载荷中的 Salt 重新派生密钥",
      formula: "DK = PBKDF2(HMAC-SHA256, 口令, Salt, 120000 轮) → 32 字节",
      kv: [
        ["口令", clip(passphrase, 28)],
        ["Salt（来自密文）", bytesToHex(salt)],
        ["派生密钥", derived],
      ],
      note: "只要口令正确，派生出的密钥就与加密端完全一致。",
    },
    {
      title: "GCM 计数器解密与认证校验",
      description: "以同一 IV 重建计数器密钥流并与密文 XOR；GHASH 重新计算认证标签并与密文尾部的 128 位标签比对，不一致立即拒绝。",
      kv: [
        ["IV", bytesToHex(iv)],
        ["校验标签", "128 位"],
      ],
    },
  ];
  steps.push(
    plainError
      ? { title: "解密结果", description: plainError, note: "常见原因：口令错误，或密文被修改/截断。" }
      : { title: "输出明文", pre: clip(plain, 480), kv: [["明文长度", `${Array.from(plain).length} 字符`]], note: "认证标签校验通过，密文未被篡改。" },
  );
  return steps;
}

// ---- SM2 / SM3 ----

function parseSm2PublicForDemo(value: string): { x: string; y: string } {
  const parsed = JSON.parse(value) as { public?: { x?: string; y?: string }; x?: string; y?: string };
  const data = parsed.public ?? parsed;
  if (!data.x || !data.y) throw new Error("SM2 公钥格式无效");
  return { x: data.x, y: data.y };
}

function parseSm2KeyForDemo(value: string): { private: string; x: string; y: string } {
  const parsed = JSON.parse(value) as { private?: string; public?: { x?: string; y?: string } };
  if (!parsed.private || !parsed.public?.x || !parsed.public?.y) throw new Error("SM2 密钥 JSON 无效，请使用“生成密钥”创建");
  return { private: parsed.private, x: parsed.public.x, y: parsed.public.y };
}

function demoSm2(request: DemoRequest): DemoStep[] {
  const keyValue = requireKeyDemo(request.key);
  if (request.mode === "encrypt") {
    const cipher = sm2Encrypt(request.input, keyValue);
    const publicPoint = parseSm2PublicForDemo(keyValue);
    const messageLength = utf8(request.input).length;
    return [
      {
        title: "解析 SM2 公钥",
        description: "SM2 使用 256 位素域椭圆曲线 sm2p256v1，公钥是曲线上的点 PB = [d]·G（d 为私钥）。",
        kv: [
          ["曲线方程", "y² = x³ + a·x + b (mod p)"],
          ["基点 G", "曲线公开常数点，阶为素数 n"],
          ["公钥 x", clip(publicPoint.x, 40)],
          ["公钥 y", clip(publicPoint.y, 40)],
        ],
      },
      {
        title: "生成随机数 k",
        kv: [["k", "本次加密随机选取（1 ≤ k ≤ n−1，一次性使用）"]],
        description: "k 每次加密都不同：即使同一明文、同一公钥，两次加密的密文也完全不同。",
      },
      {
        title: "计算 C1 = [k]·G",
        description: "椭圆曲线点乘采用倍加算法（Double-and-Add）：把 k 写成二进制，从高位到低位反复「倍加」，约 256 次点加即可完成。",
        kv: [["C1", "曲线点，按 04 ‖ x ‖ y 未压缩编码（64 字节）"]],
      },
      {
        title: "计算共享点并派生密钥流",
        formula: "(x2, y2) = [k]·PB；t = KDF(x2 ‖ y2, klen)",
        description: "接收方用自己的私钥也能算出同一个共享点；KDF 基于 SM3，把共享点坐标扩展成与明文等长的密钥流 t。",
      },
      {
        title: "计算 C2 与 C3",
        formula: "C2 = M ⊕ t；C3 = SM3(x2 ‖ M ‖ y2)",
        kv: [
          ["C2", `与明文等长（${messageLength} 字节）`],
          ["C3", "256 位 SM3 摘要，用于完整性校验"],
        ],
      },
      {
        title: "按 C1C3C2 顺序输出密文",
        description: "三段拼接后以十六进制输出；总长度 = 1 + 64 + 32 + 明文字节数。",
        table: {
          head: ["字段", "长度", "内容（十六进制节选）"],
          rows: [
            ["04", "1 字节", "未压缩点标志"],
            ["C1 x", "32 字节", clip(cipher.slice(2, 66), 42)],
            ["C1 y", "32 字节", clip(cipher.slice(66, 130), 42)],
            ["C3", "32 字节", clip(cipher.slice(130, 194), 42)],
            ["C2", `${messageLength} 字节`, clip(cipher.slice(194), 42)],
          ],
        },
        pre: clip(cipher, 420),
        note: "与「执行加密」输出一致。",
      },
    ];
  }
  const keyPair = parseSm2KeyForDemo(keyValue);
  const bytes = hexToBytes(request.input);
  if (bytes.length < 98 || bytes[0] !== 4) throw new Error("SM2 C1C3C2 密文格式无效");
  let plain = "";
  let plainError = "";
  try {
    plain = sm2Decrypt(request.input, keyValue);
  } catch (reason) {
    plainError = reason instanceof Error ? reason.message : "解密失败";
  }
  const c2Length = bytes.length - 97;
  return [
    {
      title: "解析 SM2 私钥",
      kv: [
        ["私钥 d", clip(keyPair.private, 40)],
        ["公钥 PB = [d]·G", `${keyPair.x.slice(0, 16)}… ${keyPair.y.slice(0, 16)}…`],
      ],
      note: "只有持有 d 才能从 C1 还原共享点。",
    },
    {
      title: "解析 C1C3C2 密文",
      description: "按固定偏移拆出三段：C1 是发送方临时公钥点，C3 是 SM3 校验摘要，C2 是与明文等长的密文体。",
      table: {
        head: ["字段", "字节区间", "长度", "十六进制节选"],
        rows: [
          ["04", "0", "1 字节", "04（未压缩点标志）"],
          ["C1 x", "1 – 32", "32 字节", clip(request.input.slice(2, 66), 36)],
          ["C1 y", "33 – 64", "32 字节", clip(request.input.slice(66, 130), 36)],
          ["C3", "65 – 96", "32 字节", clip(request.input.slice(130, 194), 36)],
          ["C2", `97 – ${bytes.length - 1}`, `${c2Length} 字节`, clip(request.input.slice(194), 36)],
        ],
      },
    },
    {
      title: "还原共享点与密钥流",
      formula: "(x2, y2) = [d]·C1；t = KDF(x2 ‖ y2, klen)",
      description: "用私钥 d 对 C1 做点乘，得到与加密端相同的共享点，再用 KDF 展开成密钥流。",
    },
    {
      title: "XOR 还原明文并校验 C3",
      formula: "M = C2 ⊕ t；校验 SM3(x2 ‖ M ‖ y2) = C3",
      description: "把 C2 与密钥流 XOR 得到明文，再重算 SM3 摘要与 C3 比对——不一致说明密文被篡改或密钥错误。",
    },
    plainError
      ? { title: "解密结果", description: plainError, note: "请确认密文完整，且使用的是配对的私钥。" }
      : { title: "输出明文", pre: clip(plain, 480), kv: [["明文长度", `${Array.from(plain).length} 字符`]] },
  ];
}

// ---- MD5 ----

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_CONSTANTS = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

interface Md5Trace {
  originalLength: number;
  padded: Uint8Array;
  blocks: number;
  rows: DemoCell[][];
  finalRegs: [string, string, string, string];
}

function traceMd5(input: string): Md5Trace {
  const source = utf8(input);
  const originalLength = source.length;
  const paddedLength = Math.ceil((originalLength + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[originalLength] = 0x80;
  const bitLength = BigInt(originalLength) * 8n;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Number(bitLength & 0xffffffffn), true);
  view.setUint32(paddedLength - 4, Number((bitLength >> 32n) & 0xffffffffn), true);

  const rows: DemoCell[][] = [];
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      let fnName: string;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
        fnName = "F";
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
        fnName = "G";
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
        fnName = "H";
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
        fnName = "I";
      }
      const next = d;
      d = c;
      c = b;
      const sum = (a + f + MD5_CONSTANTS[index] + words[g]) >>> 0;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      a = next;
      if (offset === 0) {
        rows.push([String(index), fnName, String(g), hex8(words[g]), hex8(MD5_CONSTANTS[index]), String(MD5_SHIFTS[index]), hex8(b)]);
      }
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return { originalLength, padded: bytes, blocks: bytes.length / 64, rows, finalRegs: [hex8(a0), hex8(b0), hex8(c0), hex8(d0)] };
}

function demoMd5(request: DemoRequest): DemoStep[] {
  const trace = traceMd5(request.input);
  const digest = md5(request.input);
  return [
    {
      title: "消息预处理",
      description: "MD5 以 512 位（64 字节）分组处理消息；中文等字符先按 UTF-8 展开成字节。",
      kv: [
        ["消息", clip(request.input, 36)],
        ["字符数", `${Array.from(request.input).length}`],
        ["UTF-8 字节数", `${trace.originalLength} 字节`],
      ],
    },
    {
      title: "比特级填充（对齐 512 位）",
      formula: "填充后长度 ≡ 0 (mod 512)，且 (长度 + 8) ≡ 0 (mod 64)",
      description: "在消息末尾追加一个 0x80，再补 0 直到长度模 64 余 56，最后 8 字节以小端序写入消息的比特长度。",
      pre: hexDump(trace.padded),
      note: `共 ${trace.blocks} 个 512 位分组，此处展开第 1 个。`,
    },
    {
      title: "初始化链接变量",
      description: "4 个 32 位寄存器 A、B、C、D，采用标准初始值（小端存放）。",
      kv: [
        ["A", "67452301"],
        ["B", "EFCDAB89"],
        ["C", "98BADCFE"],
        ["D", "10325476"],
      ],
    },
    {
      title: "主循环：4 轮 × 16 步 = 64 次迭代",
      formula: "B ← B + rotl(A + F(b,c,d) + K[i] + M[g], s)；随后 (A,B,C,D) 轮转",
      description: "每步用轮函数 F/G/H/I 混合 b、c、d，再加上模常数 K[i]、消息字 M[g] 与循环左移 s。下表展开第 1 个分组的全部 64 步。",
      table: {
        head: ["步 i", "轮函数", "g", "M[g]", "K[i]", "移位 s", "更新后的 B"],
        rows: trace.rows,
        caption: "第 1 分组迭代明细（十六进制）",
      },
      note: trace.blocks > 1 ? `其余 ${trace.blocks - 1} 个分组以相同方式迭代，每轮结束后把结果累加回链接变量。` : undefined,
    },
    {
      title: "累加并输出摘要",
      description: "把最后一轮的 a、b、c、d 分别累加进 A、B、C、D，按 A‖B‖C‖D 小端输出即为 128 位摘要。",
      kv: [
        ["A（最终）", trace.finalRegs[0]],
        ["B（最终）", trace.finalRegs[1]],
        ["C（最终）", trace.finalRegs[2]],
        ["D（最终）", trace.finalRegs[3]],
      ],
      pre: digest,
      note: "MD5 是单向散列函数：无法从摘要还原原文，因此该算法不存在「解密」。",
    },
  ];
}

// ---- 分发 ----

export async function buildDemoSteps(request: DemoRequest): Promise<DemoStep[]> {
  if (!request.input) throw new Error("请输入待处理内容");
  switch (request.algorithm) {
    case "multiliteral": return demoMultiliteral(request);
    case "autokey": return demoAutokey(request);
    case "playfair": return demoPlayfair(request);
    case "double": return demoDouble(request);
    case "ca": return demoCa(request);
    case "aes": return demoAes(request);
    case "sm2": return demoSm2(request);
    case "md5": return demoMd5(request);
  }
}
