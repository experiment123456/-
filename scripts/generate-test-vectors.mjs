import { mkdir, writeFile } from "node:fs/promises";

const engine = await import(`../src/crypto/engine.ts?v=${Date.now()}`);
const outputDir = new URL("../test-data/", import.meta.url);

const cases = [
  { number: 1, id: "multiliteral", title: "Multiliteral cipher", plain: "MEET AT GATE 2026", key: "LUMORA26" },
  { number: 2, id: "autokey", title: "Autokey ciphertext", plain: "Defend the east wall", key: "CIPHER" },
  { number: 3, id: "playfair", title: "Playfair", plain: "HIDETHEGOLDS", key: "SECURITY" },
  { number: 4, id: "double", title: "Double-Transposition", plain: "TRANSPOSITION2026", key: "ORBIT", secondKey: "GLASS" },
  { number: 5, id: "ca", title: "CA / Rule 30", plain: "Cellular automata stream 2026", key: "cafebabefeed1234" },
  { number: 6, id: "aes", title: "AES-256-GCM", plain: "AES-GCM 测试：信息安全工程实践2 / 2026", key: "Lumora-AES-2026!", randomized: true },
];

for (const item of cases) {
  item.cipher = await engine.processAlgorithm({
    algorithm: item.id,
    mode: "encrypt",
    input: item.plain,
    key: item.key,
    secondKey: item.secondKey,
  });
  item.decrypted = await engine.processAlgorithm({
    algorithm: item.id,
    mode: "decrypt",
    input: item.cipher,
    key: item.key,
    secondKey: item.secondKey,
  });
  if (item.decrypted !== item.plain) throw new Error(`${item.title} 往返校验失败`);
}

const sm2Pair = engine.createSm2KeyPair();
const sm2Plain = "SM2 国密测试：椭圆曲线公钥加密 2026";
const sm2Key = JSON.stringify(sm2Pair, null, 2);
const sm2Cipher = engine.sm2Encrypt(sm2Plain, sm2Key);
const sm2Decrypted = engine.sm2Decrypt(sm2Cipher, sm2Key);
if (sm2Decrypted !== sm2Plain) throw new Error("SM2 往返校验失败");

const md5Plain = "hello";
const md5Digest = engine.md5(md5Plain);
if (md5Digest !== "5d41402abc4b2a76b9719d911017c592") throw new Error("MD5 校验失败");

const fence = (value, language = "text") => `\`\`\`${language}\n${value}\n\`\`\``;
const lines = [
  "# Lumora Cipher 完整算法测试用例",
  "",
  "> 生成日期：2026-08-21  ｜ 适用页面：单机实验、DH 交换、双机通信",
  "",
  "## 使用方法",
  "",
  "1. 打开“单机实验”，选择对应算法。",
  "2. 将本文中的明文和密钥完整复制到网页，点击“执行加密”。",
  "3. 对确定性算法核对密文；AES 和 SM2 每次都会使用随机数，因此新密文不要求逐字相同。",
  "4. 切换到“解密”，粘贴刚得到的密文，核对解密结果。",
  "",
  "---",
  "",
];

for (const item of cases) {
  lines.push(
    `## ${item.number}. ${item.title}`,
    "",
    "- 明文：",
    "",
    fence(item.plain),
    "",
    `- ${item.secondKey ? "第一密钥" : "密钥"}：`,
    "",
    fence(item.key),
    "",
  );
  if (item.secondKey) lines.push("- 第二密钥：", "", fence(item.secondKey), "");
  lines.push("- 预期密文：", "", fence(item.cipher), "", "- 解密结果：", "", fence(item.decrypted), "");
  if (item.randomized) {
    lines.push(
      "> 注意：AES-GCM 使用随机 Salt 和 IV，重新加密得到不同密文属于正常现象。上面的密文可直接用于固定解密测试。",
      "",
    );
  }
  lines.push("---", "");
}

lines.push(
  "## 7. SM2 / SM3",
  "",
  "- 明文：",
  "",
  fence(sm2Plain),
  "",
  "- SM2 密钥 JSON：",
  "",
  fence(sm2Key, "json"),
  "",
  "- 固定解密测试密文（C1C3C2）：",
  "",
  fence(sm2Cipher),
  "",
  "- 解密结果：",
  "",
  fence(sm2Decrypted),
  "",
  "> 注意：SM2 加密使用随机临时标量，每次加密的密文不同。只需确认新密文能用同一密钥解密回原文。",
  "",
  "---",
  "",
  "## 8. MD5",
  "",
  "- 明文：",
  "",
  fence(md5Plain),
  "",
  "- 预期摘要：",
  "",
  fence(md5Digest),
  "",
  "- 补充空字符串标准摘要：",
  "",
  fence("d41d8cd98f00b204e9800998ecf8427e"),
  "",
  "> 网页当前会阻止空输入，因此空字符串向量仅用于核对标准值；页面测试请使用 `hello`。",
  "",
  "---",
  "",
  "## 9. DH 2048 密钥交换",
  "",
  "1. 打开“DH 交换”。",
  "2. 点击“开始公钥交换”。",
  "3. 预期看到“交换成功，两端密钥一致”。",
  "4. Alice 和 Bob 的 SHA-256 共享密钥应完全相同，长度为 64 个十六进制字符。",
  "5. 点击“重新生成”后，私钥、公钥和共享密钥应发生变化。",
  "",
  "---",
  "",
  "## 10. 异常与完整性测试",
  "",
  "- AES：将密钥改为 `Wrong-Key-2026` 后解密，预期提示“密钥错误或密文已被修改”。",
  "- AES：修改密文末尾任意一个 Base64 字符后解密，预期完整性校验失败。",
  "- Playfair：输入奇数长度密文 `ABCDE` 解密，预期提示密文必须包含偶数个字母。",
  "- CA：输入无效 Base64 字符串 `%%%INVALID%%%` 解密，预期提示格式不正确。",
  "- 所有算法：清空输入后执行，预期提示“请输入待处理内容”。",
  "",
  "---",
  "",
  "## 11. 双机通信测试",
  "",
  "1. 两个浏览器窗口进入“双机通信”，分别选择加密端和解密端。",
  "2. 双方配置同一个中继服务器地址（跨电脑用主机局域网 IP，不是各自 localhost），输入相同房间码：`LUMORA-TEST-2026`。具体步骤见 `TEAM-SETUP.md`；新增中文用例见 `中文与双机回归用例.md`。",
  "3. 连接后等待 DH 交换完成，接受 AES-256-GCM 算法。",
  "4. 发送消息：`来自加密端的安全消息：Lumora 2026 🔐`。",
  "5. 上传同目录中的 `lumora-upload-中文长文本.txt` 或 `lumora-transfer-payload.json`。",
  "6. 接收端应显示原始消息，文件旁应显示“MD5 已验证”。",
  "",
  "## 验收判定",
  "",
  "- 确定性算法的密文与本文一致。",
  "- AES、SM2 的密文允许不同，但必须能正确解密且篡改后失败。",
  "- 所有往返测试的解密结果与明文完全一致。",
  "- 中文、换行、数字和 Emoji 在文件传输后保持完整。",
  "",
);

const uploadText = [
  "【Lumora Cipher 文本文件测试】",
  "",
  "信息安全工程实践2 / 2026",
  "这是一段用于测试文本载入、AES 加解密和文件下载的 UTF-8 内容。",
  "",
  "边界字符：ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "数字：0123456789",
  "符号：!@#$%^&*()_+-=[]{};':,./<>?",
  "Unicode：深海鲸歌 · café · 🔐🌊🐋",
  "",
  "最后一行用于检查换行与文件结尾是否保持完整。",
].join("\n");

const transferPayload = {
  suite: "Lumora Cipher 双机文件传输测试",
  room: "LUMORA-TEST-2026",
  generatedAt: "2026-08-21T15:00:00+08:00",
  records: [
    { id: 1, message: "Hello, Lumora!", valid: true },
    { id: 2, message: "中文、换行与 Emoji：🔐🌊🐋", valid: true },
    { id: 3, message: "Integrity check / MD5 verified", valid: true },
  ],
};

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(new URL("Lumora-算法测试用例.md", outputDir), `${lines.join("\n")}\n`, "utf8"),
  writeFile(new URL("lumora-upload-中文长文本.txt", outputDir), `${uploadText}\n`, "utf8"),
  writeFile(new URL("lumora-transfer-payload.json", outputDir), `${JSON.stringify(transferPayload, null, 2)}\n`, "utf8"),
]);

console.log("已生成 8 组算法向量、DH/异常测试步骤和 2 个上传文件。全部往返校验通过。");
