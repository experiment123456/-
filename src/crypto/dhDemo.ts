import {
  aesDecryptBytes,
  aesEncryptBytes,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  completeDh,
  decodeUtf8,
  requireWebCrypto,
  utf8,
  type DhParty,
} from "./engine.ts";

export interface MitmSecrets {
  aliceSecret: string;
  eveAliceSecret: string;
  bobSecret: string;
  eveBobSecret: string;
}

export interface MitmMessageResult {
  aliceCiphertext: string;
  eveRead: string;
  eveCiphertext: string;
  bobRead: string;
}

export interface SignatureDefenseResult {
  sessionId: string;
  aliceFingerprint: string;
  bobFingerprint: string;
  aliceSignature: string;
  bobSignature: string;
  genuineValid: boolean;
  attackedValid: boolean;
}

interface SignedDhOffer {
  sessionId: string;
  role: "Alice" | "Bob";
  publicKey: string;
}

interface SigningIdentity {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  fingerprint: string;
}

function offerBytes(offer: SignedDhOffer): Uint8Array {
  return utf8(`LUMORA-DH-SIGNED-V1|${offer.sessionId}|${offer.role}|${offer.publicKey}`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function createSigningIdentity(): Promise<SigningIdentity> {
  const subtle = requireWebCrypto();
  const keys = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicBytes = await subtle.exportKey("spki", keys.publicKey);
  const digest = await subtle.digest("SHA-256", publicBytes);
  return {
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    fingerprint: bytesToHex(new Uint8Array(digest)),
  };
}

async function signOffer(privateKey: CryptoKey, offer: SignedDhOffer): Promise<string> {
  const signature = await requireWebCrypto().sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    toArrayBuffer(offerBytes(offer)),
  );
  return bytesToBase64(new Uint8Array(signature));
}

async function verifyOffer(publicKey: CryptoKey, offer: SignedDhOffer, signature: string): Promise<boolean> {
  return requireWebCrypto().verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    toArrayBuffer(base64ToBytes(signature)),
    toArrayBuffer(offerBytes(offer)),
  );
}

export async function deriveMitmSecrets(alice: DhParty, bob: DhParty, eve: DhParty): Promise<MitmSecrets> {
  const [aliceSecret, eveAliceSecret, bobSecret, eveBobSecret] = await Promise.all([
    completeDh(alice.privateKey, eve.publicKey),
    completeDh(eve.privateKey, alice.publicKey),
    completeDh(bob.privateKey, eve.publicKey),
    completeDh(eve.privateKey, bob.publicKey),
  ]);
  return { aliceSecret, eveAliceSecret, bobSecret, eveBobSecret };
}

export async function relayMitmMessage(
  original: string,
  modified: string,
  secrets: MitmSecrets,
): Promise<MitmMessageResult> {
  const aliceCiphertext = await aesEncryptBytes(utf8(original), secrets.aliceSecret);
  const eveRead = decodeUtf8(await aesDecryptBytes(aliceCiphertext, secrets.eveAliceSecret));
  const eveCiphertext = await aesEncryptBytes(utf8(modified), secrets.eveBobSecret);
  const bobRead = decodeUtf8(await aesDecryptBytes(eveCiphertext, secrets.bobSecret));
  return { aliceCiphertext, eveRead, eveCiphertext, bobRead };
}

export async function simulateSignatureDefense(
  alice: DhParty,
  bob: DhParty,
  eve: DhParty,
): Promise<SignatureDefenseResult> {
  const [aliceIdentity, bobIdentity] = await Promise.all([
    createSigningIdentity(),
    createSigningIdentity(),
  ]);
  const nonce = new Uint8Array(8);
  crypto.getRandomValues(nonce);
  const sessionId = bytesToHex(nonce).toUpperCase();
  const aliceOffer: SignedDhOffer = { sessionId, role: "Alice", publicKey: alice.publicKey };
  const bobOffer: SignedDhOffer = { sessionId, role: "Bob", publicKey: bob.publicKey };
  const [aliceSignature, bobSignature] = await Promise.all([
    signOffer(aliceIdentity.privateKey, aliceOffer),
    signOffer(bobIdentity.privateKey, bobOffer),
  ]);
  const attackedAliceOffer: SignedDhOffer = { ...aliceOffer, publicKey: eve.publicKey };
  const attackedBobOffer: SignedDhOffer = { ...bobOffer, publicKey: eve.publicKey };
  const [aliceGenuine, bobGenuine, aliceAttacked, bobAttacked] = await Promise.all([
    verifyOffer(aliceIdentity.publicKey, aliceOffer, aliceSignature),
    verifyOffer(bobIdentity.publicKey, bobOffer, bobSignature),
    verifyOffer(aliceIdentity.publicKey, attackedAliceOffer, aliceSignature),
    verifyOffer(bobIdentity.publicKey, attackedBobOffer, bobSignature),
  ]);
  return {
    sessionId,
    aliceFingerprint: aliceIdentity.fingerprint,
    bobFingerprint: bobIdentity.fingerprint,
    aliceSignature,
    bobSignature,
    genuineValid: aliceGenuine && bobGenuine,
    attackedValid: aliceAttacked || bobAttacked,
  };
}
