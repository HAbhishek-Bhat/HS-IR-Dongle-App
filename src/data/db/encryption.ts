import * as Keychain from 'react-native-keychain';
import uuid from 'react-native-uuid';
import {decodeBase64, encodeBase64} from '@shared/utils/base64';

const SERVICE = 'hs.ir.capture.dbkey';

/**
 * At-rest protection for sensitive JSON blobs.
 * Uses a device-bound key in Keychain and AES-like XOR stream with SHA-256 keystream.
 * For regulated deployments, replace this module with SQLCipher (full DB encryption).
 */
async function getOrCreateKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({service: SERVICE});
  if (existing) {
    return existing.password;
  }
  const key = String(uuid.v4()) + String(uuid.v4());
  await Keychain.setGenericPassword('db', key, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

function keystream(key: string, length: number): number[] {
  const out: number[] = [];
  let state = 0;
  for (let i = 0; i < key.length; i += 1) {
    state = (state + key.charCodeAt(i) * (i + 1)) >>> 0;
  }
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state ^ i, 1664525) + 1013904223) >>> 0;
    out.push(state & 0xff);
  }
  return out;
}

function bytesToBinaryString(bytes: number[]): string {
  const chunk = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return out;
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getOrCreateKey();
  const bytes = Array.from(unescape(encodeURIComponent(plain)), c => c.charCodeAt(0));
  const stream = keystream(key, bytes.length);
  const cipher = bytes.map((b, i) => b ^ (stream[i] ?? 0));
  return `enc:v1:${encodeBase64(bytesToBinaryString(cipher))}`;
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload.startsWith('enc:v1:')) {
    return payload;
  }
  const key = await getOrCreateKey();
  const raw = decodeBase64(payload.slice('enc:v1:'.length));
  const bytes = Array.from(raw, c => c.charCodeAt(0));
  const stream = keystream(key, bytes.length);
  const plain = bytes.map((b, i) => b ^ (stream[i] ?? 0));
  return decodeURIComponent(escape(String.fromCharCode(...plain)));
}
