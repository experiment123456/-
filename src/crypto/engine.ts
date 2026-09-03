export type AlgorithmId =
  | "multiliteral"
  | "autokey"
  | "playfair"
  | "double"
  | "ca"
  | "aes"
  | "sm2"
  | "md5";

export type CipherMode = "encrypt" | "decrypt";

export interface AlgorithmInfo {
  id: AlgorithmId;
  name: string;
  family: string;
  summary: string;
  keyLabel: string;
  secondKeyLabel?: string;
  reversible: boolean;
  network: boolean;
}

export const algorithms: AlgorithmInfo[] = [
  {
    id: "multiliteral",
    name: "Multiliteral cipher",
    family: "单表替代",
    summary: "6 × 6 密钥方阵；中文与混合文本自动使用可逆 UTF-8 扩展。",
    keyLabel: "方阵密钥",
    reversible: true,
    network: true,
  },
  {
    id: "autokey",
    name: "Autokey ciphertext",
    family: "多表替代",
    summary: "密文反馈 Autokey；中文与纯数字通过 UTF-8 扩展参与运算。",
    keyLabel: "初始关键字",
    reversible: true,
    network: true,
  },
  {
    id: "playfair",
    name: "Playfair",
    family: "多图替代",
    summary: "5 × 5 双字母替代；UTF-8 扩展保留中文、大小写和标点。",
    keyLabel: "矩阵关键字",
    reversible: true,
    network: true,
  },
  {
    id: "double",
    name: "Double-Transposition",
    family: "置换密码",
    summary: "连续两次列换位；中文和短文本使用 UTF-8 扩展，支持完整还原。",
    keyLabel: "第一换位密钥",
    secondKeyLabel: "第二换位密钥",
    reversible: true,
    network: true,
  },
  {
    id: "ca",
    name: "CA / Rule 30",
    family: "流密码",
    summary: "以一维元胞自动机 Rule 30 生成 XOR 密钥流。",
    keyLabel: "流密钥种子",
    reversible: true,
    network: true,
  },
  {
    id: "aes",
    name: "AES-256-GCM",
    family: "分块密码",
    summary: "PBKDF2 派生 256 位密钥，GCM 同时保证机密性与完整性。",
    keyLabel: "AES 口令",
    reversible: true,
    network: true,
  },
  {
    id: "sm2",
    name: "SM2 / SM3",
    family: "公钥密码",
    summary: "国密 SM2 椭圆曲线公钥加密，密文采用 C1C3C2 格式。",
    keyLabel: "SM2 密钥（JSON）",
    reversible: true,
    network: true,
  },
  {
    id: "md5",
    name: "MD5",
    family: "消息摘要",
    summary: "完整 MD5 摘要实现；摘要是单向操作，不存在解密。",
    keyLabel: "无需密钥",
    reversible: false,
    network: false,
  },
];

export interface ProcessInput {
  algorithm: AlgorithmId;
  mode: CipherMode;
  input: string;
  key?: string;
  secondKey?: string;
  textEncoding?: "auto" | "utf8";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (value: string) => encoder.encode(value);
export const decodeUtf8 = (value: Uint8Array) => decoder.decode(value);

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(clean)) throw new Error("十六进制内容格式不正确");
  const result = new Uint8Array(clean.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const stride = 0x8000;
  for (let index = 0; index < bytes.length; index += stride) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + stride, bytes.length)));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Base64 密文格式不正确");
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function secureRandom(length: number): Uint8Array {
  const result = new Uint8Array(length);
  crypto.getRandomValues(result);
  return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function requireWebCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("浏览器未开放 Web Crypto。请在每台电脑打开自己的 http://localhost 页面，再填写同一个中继地址；或使用 HTTPS 页面，不要直接用局域网 IP 的 HTTP 页面做加密实验。");
  }
  return globalThis.crypto.subtle;
}

function requireKey(key?: string): string {
  if (!key?.trim()) throw new Error("请先输入或生成密钥");
  return key.trim();
}

const MULTILITERAL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function keyedAlphabet(key: string, alphabet: string): string {
  const allowed = new Set(alphabet);
  const unique: string[] = [];
  for (const character of `${key.toUpperCase()}${alphabet}`) {
    if (allowed.has(character) && !unique.includes(character)) unique.push(character);
  }
  return unique.join("");
}

function multiliteralEncrypt(input: string, key: string): string {
  const square = keyedAlphabet(key, MULTILITERAL_ALPHABET);
  return Array.from(input.toUpperCase(), (character) => {
    if (/\s/.test(character)) return "/";
    const index = square.indexOf(character);
    if (index < 0) return `[${character}]`;
    return `${Math.floor(index / 6) + 1}${(index % 6) + 1}`;
  }).join(" ");
}

function multiliteralDecrypt(input: string, key: string): string {
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

function normalizeLetters(value: string): number[] {
  return Array.from(value.toUpperCase())
    .filter((character) => /[A-Z]/.test(character))
    .map((character) => character.charCodeAt(0) - 65);
}

function autokeyTransform(input: string, key: string, decrypting: boolean): string {
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

function playfairSquare(key: string): string {
  const alphabet = "ABCDEFGHIKLMNOPQRSTUVWXYZ";
  return keyedAlphabet(key.toUpperCase().replaceAll("J", "I"), alphabet);
}

function playfairPairs(input: string): string[][] {
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

function playfairTransform(input: string, key: string, decrypting: boolean): string {
  const square = playfairSquare(key);
  let compact = Array.from(input.toUpperCase().replaceAll("J", "I")).filter((character) => /[A-Z]/.test(character));
  if (decrypting && compact.length % 2 !== 0) throw new Error("Playfair 密文必须包含偶数个字母");
  const pairs = decrypting
    ? Array.from({ length: compact.length / 2 }, (_, index) => compact.slice(index * 2, index * 2 + 2))
    : playfairPairs(input);
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

function columnOrder(key: string): number[] {
  if (!key) throw new Error("换位密钥不能为空");
  return Array.from(key)
    .map((character, index) => ({ character, index }))
    .sort((left, right) => left.character.localeCompare(right.character) || left.index - right.index)
    .map(({ index }) => index);
}

function columnarEncrypt(input: string, key: string): string {
  const chars = Array.from(input);
  const width = Array.from(key).length;
  const order = columnOrder(key);
  let output = "";
  order.forEach((column) => {
    for (let index = column; index < chars.length; index += width) output += chars[index];
  });
  return output;
}

function columnarDecrypt(input: string, key: string): string {
  const chars = Array.from(input);
  const width = Array.from(key).length;
  const rows = Math.ceil(chars.length / width);
  const remainder = chars.length % width;
  const order = columnOrder(key);
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

function doubleTransposition(input: string, firstKey: string, secondKey: string, decrypting: boolean): string {
  return decrypting
    ? columnarDecrypt(columnarDecrypt(input, secondKey), firstKey)
    : columnarEncrypt(columnarEncrypt(input, firstKey), secondKey);
}

type ClassicalAlgorithm = "multiliteral" | "autokey" | "playfair" | "double";
export const UTF8_CIPHER_PREFIX = "LUMORA-UTF8-V1:";
// No J (Playfair merges it) or X (reserved exclusively for Playfair padding).
const BYTE_LETTERS = "ABCDEFGHIKLMNOPQ";

export function isClassicalAlgorithm(algorithm: AlgorithmId): algorithm is ClassicalAlgorithm {
  return ["multiliteral", "autokey", "playfair", "double"].includes(algorithm);
}

function encodeByteLetters(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => BYTE_LETTERS[byte >>> 4] + BYTE_LETTERS[byte & 15]).join("");
}

function decodeByteLetters(input: string): Uint8Array {
  if (input.length % 2) throw new Error("扩展密文的字节编码长度不正确");
  const bytes = new Uint8Array(input.length / 2);
  for (let index = 0; index < input.length; index += 2) {
    const high = BYTE_LETTERS.indexOf(input[index]);
    const low = BYTE_LETTERS.indexOf(input[index + 1]);
    if (high < 0 || low < 0) throw new Error("扩展密文包含无效的字节编码");
    bytes[index / 2] = (high << 4) | low;
  }
  return bytes;
}

function extensionKey(algorithm: ClassicalAlgorithm, key: string): string {
  // Keep legacy English keys unchanged; map non-Latin keys to a deterministic
  // letter keyword so that the original classical primitive still does the work.
  if (/[^\x00-\x7f]/.test(key) || (algorithm !== "double" && !/[A-Za-z]/.test(key))) {
    return encodeByteLetters(hexToBytes(md5(key)));
  }
  return key;
}

function classicalTransform(algorithm: ClassicalAlgorithm, input: string, key: string, secondKey: string, decrypting: boolean): string {
  switch (algorithm) {
    case "multiliteral": return decrypting ? multiliteralDecrypt(input, key) : multiliteralEncrypt(input, key);
    case "autokey": return autokeyTransform(input, key, decrypting);
    case "playfair": return playfairTransform(input, key, decrypting);
    case "double": return doubleTransposition(input, key, secondKey, decrypting);
  }
}

function needsUtf8Extension(algorithm: ClassicalAlgorithm, input: string, key: string, secondKey: string): boolean {
  if (input.startsWith(UTF8_CIPHER_PREFIX) || /[^\x00-\x7f]/.test(input + key + secondKey)) return true;
  if (algorithm === "multiliteral") return !/^[A-Z0-9 ]+$/.test(input);
  if (algorithm === "autokey") return !/[A-Za-z]/.test(input) || !/[A-Za-z]/.test(key);
  if (algorithm === "playfair") return playfairPairs(input).flat().join("") !== input;
  return input.length < Math.max(key.length, secondKey.length);
}

function processClassical({ algorithm, mode, input, key, secondKey, textEncoding }: ProcessInput & { algorithm: ClassicalAlgorithm }): string {
  const first = requireKey(key);
  const second = algorithm === "double" ? requireKey(secondKey) : "";
  if (mode === "decrypt" && input.startsWith(UTF8_CIPHER_PREFIX)) {
    const match = /^LUMORA-UTF8-V1:([a-z]+):([\s\S]+)$/.exec(input);
    if (!match || match[1] !== algorithm) throw new Error("UTF-8 扩展密文与所选算法不匹配，或密文不完整");
    try {
      let decoded = classicalTransform(algorithm, match[2], extensionKey(algorithm, first), extensionKey(algorithm, second), true);
      if (algorithm === "playfair") decoded = decoded.replaceAll("X", "");
      const framed = decodeByteLetters(decoded);
      if (framed.length < 17) throw new Error("缺少数据");
      const bytes = framed.slice(16);
      if (bytesToHex(framed.slice(0, 16)) !== md5(bytes)) throw new Error("校验不一致");
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("UTF-8 扩展解密失败：密钥错误或密文已被修改/截断");
    }
  }
  if (mode === "encrypt" && (textEncoding === "utf8" || needsUtf8Extension(algorithm, input, first, second))) {
    const bytes = utf8(input);
    // Unkeyed checksum catches mistakes; it is NOT cryptographic authentication.
    const prepared = encodeByteLetters(concatBytes(hexToBytes(md5(bytes)), bytes));
    const cipher = classicalTransform(algorithm, prepared, extensionKey(algorithm, first), extensionKey(algorithm, second), false);
    return `${UTF8_CIPHER_PREFIX}${algorithm}:${cipher}`;
  }
  return classicalTransform(algorithm, input, first, second, mode === "decrypt");
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of utf8(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function caKeystream(length: number, seed: string): Uint8Array {
  let cells = fnv1a(seed) || 0xa5a5a5a5;
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

function xorBytes(input: Uint8Array, key: Uint8Array): Uint8Array {
  return Uint8Array.from(input, (byte, index) => byte ^ key[index]);
}

function caEncrypt(input: string, key: string): string {
  const bytes = utf8(input);
  return bytesToBase64(xorBytes(bytes, caKeystream(bytes.length, key)));
}

function caDecrypt(input: string, key: string): string {
  const bytes = base64ToBytes(input);
  return decodeUtf8(xorBytes(bytes, caKeystream(bytes.length, key)));
}

export async function aesEncryptBytes(input: Uint8Array, passphrase: string): Promise<string> {
  const subtle = requireWebCrypto();
  const salt = secureRandom(16);
  const iv = secureRandom(12);
  const material = await subtle.importKey("raw", toArrayBuffer(utf8(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations: 120_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const encrypted = await subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(input));
  return bytesToBase64(concatBytes(salt, iv, new Uint8Array(encrypted)));
}

export async function aesDecryptBytes(payload: string, passphrase: string): Promise<Uint8Array> {
  const subtle = requireWebCrypto();
  const bytes = base64ToBytes(payload);
  if (bytes.length < 44) throw new Error("AES-GCM 密文长度不足");
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ciphertext = bytes.slice(28);
  const material = await subtle.importKey("raw", toArrayBuffer(utf8(passphrase)), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations: 120_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
    return new Uint8Array(plain);
  } catch {
    throw new Error("AES-GCM 解密失败：密钥错误或密文已被修改");
  }
}

async function aesEncryptText(input: string, key: string): Promise<string> {
  return aesEncryptBytes(utf8(input), key);
}

async function aesDecryptText(input: string, key: string): Promise<string> {
  return decodeUtf8(await aesDecryptBytes(input, key));
}

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

export function md5(input: string | Uint8Array): string {
  const source = typeof input === "string" ? utf8(input) : input;
  const originalLength = source.length;
  const paddedLength = Math.ceil((originalLength + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[originalLength] = 0x80;
  const bitLength = BigInt(originalLength) * 8n;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Number(bitLength & 0xffffffffn), true);
  view.setUint32(paddedLength - 4, Number((bitLength >> 32n) & 0xffffffffn), true);

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
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const next = d;
      d = c;
      c = b;
      const sum = (a + f + MD5_CONSTANTS[index] + words[g]) >>> 0;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return bytesToHex(digest);
}

function rotateWord(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function permutation0(value: number): number {
  return (value ^ rotateWord(value, 9) ^ rotateWord(value, 17)) >>> 0;
}

function permutation1(value: number): number {
  return (value ^ rotateWord(value, 15) ^ rotateWord(value, 23)) >>> 0;
}

function sm3(input: Uint8Array): Uint8Array {
  const bitLength = BigInt(input.length) * 8n;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;
  const dataView = new DataView(data.buffer);
  dataView.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
  dataView.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false);
  let state = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e];

  for (let offset = 0; offset < data.length; offset += 64) {
    const w = new Array<number>(68);
    const wPrime = new Array<number>(64);
    for (let index = 0; index < 16; index += 1) w[index] = dataView.getUint32(offset + index * 4, false);
    for (let index = 16; index < 68; index += 1) {
      w[index] = (permutation1(w[index - 16] ^ w[index - 9] ^ rotateWord(w[index - 3], 15)) ^ rotateWord(w[index - 13], 7) ^ w[index - 6]) >>> 0;
    }
    for (let index = 0; index < 64; index += 1) wPrime[index] = (w[index] ^ w[index + 4]) >>> 0;
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const t = index < 16 ? 0x79cc4519 : 0x7a879d8a;
      const ss1 = rotateWord((rotateWord(a, 12) + e + rotateWord(t, index % 32)) >>> 0, 7);
      const ss2 = ss1 ^ rotateWord(a, 12);
      const ff = index < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c);
      const gg = index < 16 ? e ^ f ^ g : (e & f) | (~e & g);
      const tt1 = (ff + d + ss2 + wPrime[index]) >>> 0;
      const tt2 = (gg + h + ss1 + w[index]) >>> 0;
      d = c;
      c = rotateWord(b, 9);
      b = a;
      a = tt1;
      h = g;
      g = rotateWord(f, 19);
      f = e;
      e = permutation0(tt2);
    }
    state = [state[0] ^ a, state[1] ^ b, state[2] ^ c, state[3] ^ d, state[4] ^ e, state[5] ^ f, state[6] ^ g, state[7] ^ h].map((value) => value >>> 0);
  }
  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  state.forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

const SM2_P = BigInt("0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF");
const SM2_A = BigInt("0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC");
const SM2_B = BigInt("0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93");
const SM2_N = BigInt("0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123");
const SM2_GX = BigInt("0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7");
const SM2_GY = BigInt("0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0");

interface Point {
  x: bigint;
  y: bigint;
}

const SM2_G: Point = { x: SM2_GX, y: SM2_GY };

function modulo(value: bigint, divisor: bigint): bigint {
  const result = value % divisor;
  return result >= 0n ? result : result + divisor;
}

function inverse(value: bigint, divisor: bigint): bigint {
  let [oldR, r] = [modulo(value, divisor), divisor];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) throw new Error("无法求取模逆");
  return modulo(oldS, divisor);
}

function pointAdd(left: Point | null, right: Point | null): Point | null {
  if (!left) return right;
  if (!right) return left;
  if (left.x === right.x && modulo(left.y + right.y, SM2_P) === 0n) return null;
  const slope = left.x === right.x && left.y === right.y
    ? modulo((3n * left.x * left.x + SM2_A) * inverse(2n * left.y, SM2_P), SM2_P)
    : modulo((right.y - left.y) * inverse(right.x - left.x, SM2_P), SM2_P);
  const x = modulo(slope * slope - left.x - right.x, SM2_P);
  const y = modulo(slope * (left.x - x) - left.y, SM2_P);
  return { x, y };
}

function scalarMultiply(scalar: bigint, point: Point): Point | null {
  let result: Point | null = null;
  let addend: Point | null = point;
  let value = scalar;
  while (value > 0n) {
    if (value & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    value >>= 1n;
  }
  return result;
}

function pointIsValid(point: Point): boolean {
  if (point.x < 0n || point.x >= SM2_P || point.y < 0n || point.y >= SM2_P) return false;
  return modulo(point.y * point.y, SM2_P) === modulo(point.x * point.x * point.x + SM2_A * point.x + SM2_B, SM2_P);
}

function bigintToBytes(value: bigint, length = 32): Uint8Array {
  return hexToBytes(value.toString(16).padStart(length * 2, "0"));
}

function randomScalar(order: bigint): bigint {
  let value = 0n;
  do value = BigInt(`0x${bytesToHex(secureRandom(32))}`) % order;
  while (value === 0n);
  return value;
}

function sm2Kdf(input: Uint8Array, length: number): Uint8Array {
  const output = new Uint8Array(length);
  let counter = 1;
  let offset = 0;
  while (offset < length) {
    const suffix = new Uint8Array(4);
    new DataView(suffix.buffer).setUint32(0, counter, false);
    const hash = sm3(concatBytes(input, suffix));
    const count = Math.min(hash.length, length - offset);
    output.set(hash.slice(0, count), offset);
    offset += count;
    counter += 1;
  }
  return output;
}

export interface Sm2KeyPair {
  private: string;
  public: { x: string; y: string };
}

export function createSm2KeyPair(): Sm2KeyPair {
  const privateKey = randomScalar(SM2_N);
  const publicKey = scalarMultiply(privateKey, SM2_G);
  if (!publicKey) throw new Error("SM2 密钥生成失败");
  return {
    private: privateKey.toString(16).padStart(64, "0"),
    public: {
      x: publicKey.x.toString(16).padStart(64, "0"),
      y: publicKey.y.toString(16).padStart(64, "0"),
    },
  };
}

function parseSm2Key(value: string): Sm2KeyPair {
  try {
    const parsed = JSON.parse(value) as Sm2KeyPair;
    if (!parsed.private || !parsed.public?.x || !parsed.public?.y) throw new Error();
    const point = { x: BigInt(`0x${parsed.public.x}`), y: BigInt(`0x${parsed.public.y}`) };
    if (!pointIsValid(point)) throw new Error();
    return parsed;
  } catch {
    throw new Error("SM2 密钥 JSON 无效，请使用“生成密钥”创建");
  }
}

function parseSm2Public(value: string): Point {
  try {
    const parsed = JSON.parse(value) as Sm2KeyPair | { x: string; y: string };
    const data = "public" in parsed ? parsed.public : parsed;
    const point = { x: BigInt(`0x${data.x}`), y: BigInt(`0x${data.y}`) };
    if (!pointIsValid(point)) throw new Error();
    return point;
  } catch {
    throw new Error("SM2 公钥格式无效");
  }
}

export function sm2Encrypt(input: string, publicKeyValue: string): string {
  const publicKey = parseSm2Public(publicKeyValue);
  const message = utf8(input);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const k = randomScalar(SM2_N);
    const c1 = scalarMultiply(k, SM2_G);
    const shared = scalarMultiply(k, publicKey);
    if (!c1 || !shared) continue;
    const x2 = bigintToBytes(shared.x);
    const y2 = bigintToBytes(shared.y);
    const stream = sm2Kdf(concatBytes(x2, y2), message.length);
    if (stream.every((byte) => byte === 0)) continue;
    const c2 = xorBytes(message, stream);
    const c3 = sm3(concatBytes(x2, message, y2));
    return bytesToHex(concatBytes(new Uint8Array([4]), bigintToBytes(c1.x), bigintToBytes(c1.y), c3, c2));
  }
  throw new Error("SM2 加密失败，请重试");
}

export function sm2Decrypt(payload: string, privateKeyValue: string): string {
  const keyPair = parseSm2Key(privateKeyValue);
  const privateKey = BigInt(`0x${keyPair.private}`);
  const bytes = hexToBytes(payload);
  if (bytes.length < 98 || bytes[0] !== 4) throw new Error("SM2 C1C3C2 密文格式无效");
  const c1 = { x: BigInt(`0x${bytesToHex(bytes.slice(1, 33))}`), y: BigInt(`0x${bytesToHex(bytes.slice(33, 65))}`) };
  if (!pointIsValid(c1)) throw new Error("SM2 密文中的椭圆曲线点无效");
  const c3 = bytes.slice(65, 97);
  const c2 = bytes.slice(97);
  const shared = scalarMultiply(privateKey, c1);
  if (!shared) throw new Error("SM2 共享点计算失败");
  const x2 = bigintToBytes(shared.x);
  const y2 = bigintToBytes(shared.y);
  const stream = sm2Kdf(concatBytes(x2, y2), c2.length);
  const message = xorBytes(c2, stream);
  const check = sm3(concatBytes(x2, message, y2));
  if (!check.every((byte, index) => byte === c3[index])) throw new Error("SM2 完整性校验失败：密钥错误或密文已被修改");
  return decodeUtf8(message);
}

// —— SM2 数字签名（GM/T 0003.2）—— 供图片水印取证复用，不影响既有 SM2 加解密。
const SM2_DEFAULT_ID = "1234567812345678";

function sm2IdentityHash(publicKey: Point, userId: string): Uint8Array {
  const idBytes = utf8(userId);
  const entl = new Uint8Array(2);
  new DataView(entl.buffer).setUint16(0, idBytes.length * 8, false);
  return sm3(concatBytes(entl, idBytes, bigintToBytes(SM2_A), bigintToBytes(SM2_B), bigintToBytes(SM2_GX), bigintToBytes(SM2_GY), bigintToBytes(publicKey.x), bigintToBytes(publicKey.y)));
}

function sm2DigestValue(message: string, publicKey: Point, userId: string): bigint {
  const za = sm2IdentityHash(publicKey, userId);
  const digest = sm3(concatBytes(za, utf8(message)));
  return BigInt(`0x${bytesToHex(digest)}`);
}

// 返回 r||s 的 128 位十六进制字符串。
export function sm2Sign(message: string, privateKeyValue: string, userId: string = SM2_DEFAULT_ID): string {
  const keyPair = parseSm2Key(privateKeyValue);
  const privateKey = BigInt(`0x${keyPair.private}`);
  const publicKey: Point = { x: BigInt(`0x${keyPair.public.x}`), y: BigInt(`0x${keyPair.public.y}`) };
  const e = sm2DigestValue(message, publicKey, userId);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const k = randomScalar(SM2_N);
    const point = scalarMultiply(k, SM2_G);
    if (!point) continue;
    const r = modulo(e + point.x, SM2_N);
    if (r === 0n || r + k === SM2_N) continue;
    const s = modulo(inverse(1n + privateKey, SM2_N) * (k - r * privateKey), SM2_N);
    if (s === 0n) continue;
    return `${r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}`;
  }
  throw new Error("SM2 签名失败，请重试");
}

export function sm2Verify(message: string, signatureHex: string, publicKeyValue: string, userId: string = SM2_DEFAULT_ID): boolean {
  const clean = signatureHex.replace(/\s+/g, "");
  if (!/^[0-9a-f]{128}$/i.test(clean)) return false;
  const r = BigInt(`0x${clean.slice(0, 64)}`);
  const s = BigInt(`0x${clean.slice(64)}`);
  if (r < 1n || r >= SM2_N || s < 1n || s >= SM2_N) return false;
  let publicKey: Point;
  try {
    publicKey = parseSm2Public(publicKeyValue);
  } catch {
    return false;
  }
  const e = sm2DigestValue(message, publicKey, userId);
  const t = modulo(r + s, SM2_N);
  if (t === 0n) return false;
  const point = pointAdd(scalarMultiply(s, SM2_G), scalarMultiply(t, publicKey));
  if (!point) return false;
  return modulo(e + point.x, SM2_N) === r;
}

const DH_P = BigInt(
  "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF",
);
const DH_G = 2n;

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let value = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = (result * value) % modulus;
    value = (value * value) % modulus;
    power >>= 1n;
  }
  return result;
}

export interface DhParty {
  privateKey: string;
  publicKey: string;
}

export function createDhParty(): DhParty {
  const privateKey = BigInt(`0x${bytesToHex(secureRandom(32))}`) % (DH_P - 3n) + 2n;
  return {
    privateKey: privateKey.toString(16),
    publicKey: modPow(DH_G, privateKey, DH_P).toString(16),
  };
}

export async function completeDh(privateKeyHex: string, peerPublicHex: string): Promise<string> {
  const subtle = requireWebCrypto();
  let privateKey: bigint;
  let peerPublic: bigint;
  try {
    privateKey = BigInt(`0x${privateKeyHex.replace(/^0x/i, "")}`);
    peerPublic = BigInt(`0x${peerPublicHex.replace(/^0x/i, "")}`);
  } catch {
    throw new Error("DH 密钥必须是十六进制数");
  }
  if (privateKey <= 1n || peerPublic <= 1n || peerPublic >= DH_P - 1n) throw new Error("DH 密钥超出安全范围");
  const shared = modPow(peerPublic, privateKey, DH_P);
  const sharedBytes = bigintToBytes(shared, 256);
  const digest = await subtle.digest("SHA-256", toArrayBuffer(sharedBytes));
  return bytesToHex(new Uint8Array(digest));
}

function randomKeyword(length = 12): string {
  let result = "";
  while (result.length < length) {
    for (const byte of secureRandom(length)) {
      if (byte < 234) result += String.fromCharCode(65 + byte % 26);
      if (result.length === length) break;
    }
  }
  return result;
}

export function generateKey(algorithm: AlgorithmId): { key: string; secondKey?: string } {
  switch (algorithm) {
    case "multiliteral":
      return { key: randomKeyword() };
    case "autokey":
      return { key: randomKeyword() };
    case "playfair":
      return { key: randomKeyword() };
    case "double":
      return { key: randomKeyword(8), secondKey: randomKeyword(8) };
    case "ca":
      return { key: bytesToHex(secureRandom(16)) };
    case "aes":
      return { key: bytesToBase64(secureRandom(24)) };
    case "sm2":
      return { key: JSON.stringify(createSm2KeyPair(), null, 2) };
    case "md5":
      return { key: "" };
  }
}

export async function processAlgorithm({ algorithm, mode, input, key, secondKey, textEncoding = "auto" }: ProcessInput): Promise<string> {
  if (!input) throw new Error("请输入待处理内容");
  if (isClassicalAlgorithm(algorithm)) return processClassical({ algorithm, mode, input, key, secondKey, textEncoding });
  switch (algorithm) {
    case "ca":
      return mode === "encrypt" ? caEncrypt(input, requireKey(key)) : caDecrypt(input, requireKey(key));
    case "aes":
      return mode === "encrypt" ? aesEncryptText(input, requireKey(key)) : aesDecryptText(input, requireKey(key));
    case "sm2":
      return mode === "encrypt" ? sm2Encrypt(input, requireKey(key)) : sm2Decrypt(input, requireKey(key));
    case "md5":
      return md5(input);
  }
}
