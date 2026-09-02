# Lumora Cipher 完整算法测试用例

> 生成日期：2026-08-21  ｜ 适用页面：单机实验、DH 交换、双机通信

## 使用方法

1. 打开“单机实验”，选择对应算法。
2. 将本文中的明文和密钥完整复制到网页，点击“执行加密”。
3. 对确定性算法核对密文；AES 和 SM2 每次都会使用随机数，因此新密文不要求逐字相同。
4. 切换到“解密”，粘贴刚得到的密文，核对解密结果。

---

## 1. Multiliteral cipher

- 明文：

```text
MEET AT GATE 2026
```

- 密钥：

```text
LUMORA26
```

- 预期密文：

```text
13 26 26 45 / 16 45 / 32 16 45 26 / 21 55 21 22
```

- 解密结果：

```text
MEET AT GATE 2026
```

---

## 2. Autokey ciphertext

- 明文：

```text
Defend the east wall
```

- 密钥：

```text
CIPHER
```

- 预期密文：

```text
Fmulru yty prmr pyac
```

- 解密结果：

```text
Defend the east wall
```

---

## 3. Playfair

- 明文：

```text
HIDETHEGOLDS
```

- 密钥：

```text
SECURITY
```

- 预期密文：

```text
DAFSAFCFPMLI
```

- 解密结果：

```text
HIDETHEGOLDS
```

---

## 4. Double-Transposition

- 明文：

```text
TRANSPOSITION2026
```

- 第一密钥：

```text
ORBIT
```

- 第二密钥：

```text
GLASS
```

- 预期密文：

```text
NPOA2RTSTO0NI6I2S
```

- 解密结果：

```text
TRANSPOSITION2026
```

---

## 5. CA / Rule 30

- 明文：

```text
Cellular automata stream 2026
```

- 密钥：

```text
cafebabefeed1234
```

- 预期密文：

```text
XgjJyVtNFK1ITGqclMFiH1m/51EjfeGjfKbbvlk=
```

- 解密结果：

```text
Cellular automata stream 2026
```

---

## 6. AES-256-GCM

- 明文：

```text
AES-GCM 测试：信息安全工程实践2 / 2026
```

- 密钥：

```text
Lumora-AES-2026!
```

- 预期密文：

```text
O0xJbLe91f21AmBZdQ6xAmagp7AbRvNi6Ut+c4VHPnZqwBSdU93+sZSmNiqUm7bV1qbqU3xXC4b7rrI8VBi1ATe/H1jys3pbZjwXRI8BqJxLKSeKhqu7xeIfHAFi
```

- 解密结果：

```text
AES-GCM 测试：信息安全工程实践2 / 2026
```

> 注意：AES-GCM 使用随机 Salt 和 IV，重新加密得到不同密文属于正常现象。上面的密文可直接用于固定解密测试。

---

## 7. SM2 / SM3

- 明文：

```text
SM2 国密测试：椭圆曲线公钥加密 2026
```

- SM2 密钥 JSON：

```json
{
  "private": "1a3d02e2392549844ee7619a21329ba167e2066f2fa1414dfc6528c456c84230",
  "public": {
    "x": "e9171d403f625001db026ebfa4f7c697a9c5ddde6a67c31f4a26a7c6812cf903",
    "y": "35491c91637699bc99435d4113158ce16fd45ab280c32edc32bad01b568aa362"
  }
}
```

- 固定解密测试密文（C1C3C2）：

```text
04a01fe3d5a302715b0bea78c70faff79022ce850426af562f9ccb686a77ec595b16ac3129f683733bb14dfe1b28f9c69fc1fd320bde5e26369827afd8280e7e388e3018a83562fcffb35e4846fe18bcf17abd492a3b87d3766eb2232504187af7f22a6fb82b3c1f8095e67dc73de13d31e9daf3a681b2b1021386b424ade692dc9ee286cad6490e2a1ad068f96d1303b4
```

- 解密结果：

```text
SM2 国密测试：椭圆曲线公钥加密 2026
```

> 注意：SM2 加密使用随机临时标量，每次加密的密文不同。只需确认新密文能用同一密钥解密回原文。

---

## 8. MD5

- 明文：

```text
hello
```

- 预期摘要：

```text
5d41402abc4b2a76b9719d911017c592
```

- 补充空字符串标准摘要：

```text
d41d8cd98f00b204e9800998ecf8427e
```

> 网页当前会阻止空输入，因此空字符串向量仅用于核对标准值；页面测试请使用 `hello`。

---

## 9. DH 2048 密钥交换

1. 打开“DH 交换”。
2. 点击“开始公钥交换”。
3. 预期看到“交换成功，两端密钥一致”。
4. Alice 和 Bob 的 SHA-256 共享密钥应完全相同，长度为 64 个十六进制字符。
5. 点击“重新生成”后，私钥、公钥和共享密钥应发生变化。

---

## 10. 异常与完整性测试

- AES：将密钥改为 `Wrong-Key-2026` 后解密，预期提示“密钥错误或密文已被修改”。
- AES：修改密文末尾任意一个 Base64 字符后解密，预期完整性校验失败。
- Playfair：输入奇数长度密文 `ABCDE` 解密，预期提示密文必须包含偶数个字母。
- CA：输入无效 Base64 字符串 `%%%INVALID%%%` 解密，预期提示格式不正确。
- 所有算法：清空输入后执行，预期提示“请输入待处理内容”。

---

## 11. 双机通信测试

1. 两个浏览器窗口进入“双机通信”，分别选择加密端和解密端。
2. 双方配置同一个中继服务器地址（跨电脑用主机局域网 IP，不是各自 localhost），输入相同房间码：`LUMORA-TEST-2026`。具体步骤见 `TEAM-SETUP.md`；新增中文用例见 `中文与双机回归用例.md`。
3. 连接后等待 DH 交换完成，接受 AES-256-GCM 算法。
4. 发送消息：`来自加密端的安全消息：Lumora 2026 🔐`。
5. 上传同目录中的 `lumora-upload-中文长文本.txt` 或 `lumora-transfer-payload.json`。
6. 接收端应显示原始消息，文件旁应显示“MD5 已验证”。

## 验收判定

- 确定性算法的密文与本文一致。
- AES、SM2 的密文允许不同，但必须能正确解密且篡改后失败。
- 所有往返测试的解密结果与明文完全一致。
- 中文、换行、数字和 Emoji 在文件传输后保持完整。
