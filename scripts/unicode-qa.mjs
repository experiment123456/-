import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { processAlgorithm, generateKey, md5, aesEncryptBytes, aesDecryptBytes, UTF8_CIPHER_PREFIX, isClassicalAlgorithm } from "../src/crypto/engine.ts";

const samples = ["你好", "中", "中文加密测试，世界你好！", "Hello 中文 / 2026 🔐🚀\n第二行\t保留 空格！", "1234567890", "hello, jolly XXX!", "  A  B \r\n C\t ", "LUMORA-UTF8-V1:literal:原文"];
const ids = ["multiliteral", "autokey", "playfair", "double", "ca", "aes", "sm2"];
const legacy = [
  ["multiliteral", "MEET AT GATE 2026", "LUMORA26", "", "13 26 26 45 / 16 45 / 32 16 45 26 / 21 55 21 22"],
  ["autokey", "Defend the east wall", "CIPHER", "", "Fmulru yty prmr pyac"],
  ["playfair", "HIDETHEGOLDS", "SECURITY", "", "DAFSAFCFPMLI"],
  ["double", "TRANSPOSITION2026", "ORBIT", "GLASS", "NPOA2RTSTO0NI6I2S"],
];
let roundTrips = 0;
for (const algorithm of ids) {
  const keys = generateKey(algorithm);
  assert.notEqual(generateKey(algorithm).key, keys.key, `${algorithm}: generate must produce a new key`);
  for (const input of samples) {
    const cipher = await processAlgorithm({ algorithm, mode: "encrypt", input, ...keys });
    assert.notEqual(cipher, input, `${algorithm}: ciphertext must not be unchanged`);
    assert.ok(!cipher.includes("你好"), `${algorithm}: Chinese must not pass through`);
    assert.equal(await processAlgorithm({ algorithm, mode: "decrypt", input: cipher, ...keys }), input, `${algorithm}: exact Unicode round trip`);
    roundTrips++;
  }
  if (algorithm !== "sm2") {
    const input = "中文密钥也参与加密 🔐";
    const chineseKeys = { key: "第一把中文密钥甲", secondKey: "第二把中文密钥乙" };
    const cipher = await processAlgorithm({ algorithm, mode: "encrypt", input, ...chineseKeys });
    const changed = await processAlgorithm({ algorithm, mode: "encrypt", input, key: "更换后的密钥丙", secondKey: "新的第二密钥丁" });
    assert.notEqual(cipher, changed, `${algorithm}: changed key changes Chinese ciphertext`);
    assert.equal(await processAlgorithm({ algorithm, mode: "decrypt", input: cipher, ...chineseKeys }), input);
    if (isClassicalAlgorithm(algorithm)) {
      assert.ok(cipher.startsWith(UTF8_CIPHER_PREFIX));
      await assert.rejects(processAlgorithm({ algorithm, mode: "decrypt", input: cipher, key: "WRONG", secondKey: "WRONG" }), /解密失败/);
      await assert.rejects(processAlgorithm({ algorithm, mode: "decrypt", input: cipher.slice(0, -1), ...chineseKeys }));
      await assert.rejects(processAlgorithm({ algorithm, mode: "decrypt", input: UTF8_CIPHER_PREFIX + "aes:AAAA", ...chineseKeys }), /不匹配/);
    }
    roundTrips++;
  }
}
for (const [algorithm, input, key, secondKey, expected] of legacy) {
  assert.equal(await processAlgorithm({ algorithm, input, key, secondKey, mode: "encrypt" }), expected, `${algorithm}: preserve legacy vector`);
  assert.equal(await processAlgorithm({ algorithm, input: expected, key, secondKey, mode: "decrypt" }), input);
}
const manual = await readFile(new URL("../test-data/中文与双机回归用例.md", import.meta.url), "utf8");
for (const [algorithm, key, secondKey] of [["multiliteral", "LUMORA26", ""], ["autokey", "CIPHER", ""], ["playfair", "SECURITY", ""], ["double", "ORBIT", "GLASS"], ["ca", "cafebabefeed1234", ""]]) {
  const cipher = await processAlgorithm({ algorithm, key, secondKey, input: "你好", mode: "encrypt" });
  assert.ok(manual.includes(cipher), `${algorithm}: manual Chinese vector matches actual implementation`);
}
// Forced UTF-8 transport also preserves classical ASCII input (including Playfair padding/J/case).
for (const algorithm of ids.filter(isClassicalAlgorithm)) {
  const keys = generateKey(algorithm);
  for (const input of ["MEET AT 2026", "BALLOON", "JIGSAWXX", "0123456789", "   "]) {
    const cipher = await processAlgorithm({ algorithm, input, ...keys, mode: "encrypt", textEncoding: "utf8" });
    assert.equal(await processAlgorithm({ algorithm, input: cipher, ...keys, mode: "decrypt" }), input);
    roundTrips++;
  }
}
for (const sample of samples) assert.equal(md5(sample), createHash("md5").update(sample, "utf8").digest("hex"));
for (const bytes of [new Uint8Array(), new Uint8Array([0, 255, 1, 2, 128])]) {
  const cipher = await aesEncryptBytes(bytes, "中文文件密码");
  assert.deepEqual(await aesDecryptBytes(cipher, "中文文件密码"), bytes);
  await assert.rejects(aesDecryptBytes(cipher, "错误密码"));
}
console.log(JSON.stringify({ unicodeRoundTrips: roundTrips, legacyVectors: legacy.length, allSevenAlgorithms: true, chineseKeys: true, wrongKeyAndTruncation: true, md5Reference: true, emptyAndBinaryFiles: true }, null, 2));
