// The gym-access protocol (CLAUDE.md "Protocol"), the same as the Android app's GymCrypto.kt.
// No DOM, so the tests run it in Node.
import { ed25519, x25519, sha256, sha512, hmac, hkdf } from './vendor/noble.js';
import qrcodegen from './vendor/qrcodegen.js';

const P = (1n << 255n) - 19n;
const INFO = new TextEncoder().encode('gym-access-v1');

export function edPublicKey(seed) {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes');
  return ed25519.getPublicKey(seed);
}

/** X25519 private key: SHA-512(seed)[0..32], clamped. */
export function edSeedToX25519(seed) {
  const k = sha512(seed).slice(0, 32);
  k[0] &= 248;
  k[31] = (k[31] & 127) | 64;
  return k;
}

/** X25519 public key: u = (1+y)/(1-y) mod p, y = Ed pk little-endian with the top bit cleared. */
export function edPkToX25519(pk) {
  if (pk.length !== 32) throw new Error('public key must be 32 bytes');
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? pk[i] & 0x7f : pk[i]);
  const den = mod(1n - y);
  if (den === 0n) throw new Error('invalid public key');
  let u = mod((1n + y) * inverse(den));
  const out = new Uint8Array(32); // little-endian
  for (let i = 0; i < 32; i++) { out[i] = Number(u & 0xffn); u >>= 8n; }
  return out;
}

/** S = X25519(mySk, theirXpk). Throws on an all-zero result. */
export function sharedSecret(mySeed, theirEdPk) {
  const xsk = edSeedToX25519(mySeed);
  let s;
  try {
    s = x25519.scalarMult(xsk, edPkToX25519(theirEdPk));
  } finally {
    xsk.fill(0);
  }
  if (s.every((b) => b === 0)) throw new Error('all-zero shared secret');
  return s;
}

/** K on the phone: from the device seed and the gym public key. Zero salt, as on Android. */
export function deriveK(devSeed, gymPk) {
  const devPk = edPublicKey(devSeed);
  const s = sharedSecret(devSeed, gymPk);
  const k = hkdf(sha256, s, new Uint8Array(32), concat(INFO, devPk, gymPk), 32);
  s.fill(0);
  return k;
}

export const timeStep = (unixSeconds) => Math.floor(unixSeconds / 10) * 10;

export function tag(k, t) {
  const tb = new Uint8Array([(t >>> 24) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255]);
  return hmac(sha256, k, tb).slice(0, 7);
}

export const keyId = (devPk) => sha256(devPk).slice(0, 4);

export const liveCode = (devPk, k, t) => concat(keyId(devPk), tag(k, t));

export const registrationCode = (devPk, k, t) => concat(devPk, tag(k, t));

const { QrCode, QrSegment } = qrcodegen;

/** Live code: Version 1, level Q. */
export const liveQr = (code) => encode(code, QrCode.Ecc.QUARTILE, 1);

/** Registration code: Version 3, level M. */
export const registrationQr = (code) => encode(code, QrCode.Ecc.MEDIUM, 3);

const encode = (b, ecc, version) =>
  QrCode.encodeSegments([QrSegment.makeBytes(Array.from(b))], ecc, version, version, -1, false);

export const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function unhex(s) {
  if (!/^([0-9a-f]{2})*$/i.test(s)) throw new Error('bad hex');
  return Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

const mod = (a) => ((a % P) + P) % P;

/** a^(p−2) mod p: the inverse, since p is prime. */
function inverse(a) {
  let result = 1n, base = mod(a), e = P - 2n;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % P;
    base = (base * base) % P;
    e >>= 1n;
  }
  return result;
}
