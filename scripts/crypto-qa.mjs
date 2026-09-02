const engine = await import(`../src/crypto/engine.ts?v=${Date.now()}`);
const checks = {};

checks.md5 = engine.md5("hello") === "5d41402abc4b2a76b9719d911017c592";
const cases = [
  ["multiliteral", "MEET AT 2026", "LUMORA26", ""],
  ["autokey", "Defend the east wall", "CIPHER", ""],
  ["playfair", "HIDETHEGOLDS", "SECURITY", ""],
  ["double", "换位密码 keeps symbols 2026", "ORBIT", "GLASS"],
  ["ca", "元胞自动机流密码 2026", "cafebabefeed1234", ""],
  ["aes", "AES-GCM 中文往返 2026", "correct horse battery staple", ""],
];

for (const [algorithm, plain, key, secondKey] of cases) {
  const encrypted = await engine.processAlgorithm({ algorithm, mode: "encrypt", input: plain, key, secondKey });
  const decrypted = await engine.processAlgorithm({ algorithm, mode: "decrypt", input: encrypted, key, secondKey });
  checks[algorithm] = decrypted === plain;
}

const pair = engine.createSm2KeyPair();
const sm2Plain = "SM2 国密公钥加密往返";
const sm2Cipher = engine.sm2Encrypt(sm2Plain, JSON.stringify(pair.public));
checks.sm2 = engine.sm2Decrypt(sm2Cipher, JSON.stringify(pair)) === sm2Plain && sm2Cipher.startsWith("04");
const alice = engine.createDhParty();
const bob = engine.createDhParty();
const [left, right] = await Promise.all([
  engine.completeDh(alice.privateKey, bob.publicKey),
  engine.completeDh(bob.privateKey, alice.publicKey),
]);
checks.dh = left === right && left.length === 64;

const demo = await import(`../src/crypto/dhDemo.ts?v=${Date.now()}`);
const eve = engine.createDhParty();
const mitm = await demo.deriveMitmSecrets(alice, bob, eve);
checks.dhMitm = mitm.aliceSecret === mitm.eveAliceSecret
  && mitm.bobSecret === mitm.eveBobSecret
  && mitm.aliceSecret !== mitm.bobSecret;
const relay = await demo.relayMitmMessage("转账100元", "转账900元", mitm);
checks.dhMitmMessage = relay.eveRead === "转账100元" && relay.bobRead === "转账900元";
const defense = await demo.simulateSignatureDefense(alice, bob, eve);
checks.dhSignatureDefense = defense.genuineValid === true && defense.attackedValid === false;

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => value !== true)) process.exitCode = 1;
