/**
 * Link (vinculación) service (S5) — a unique QR per familiar email.
 * The code is derived deterministically from the email (SHA-256, hex
 * prefix), so the same email always produces the same code and no two
 * emails share one. QR payloads are self-describing JSON; foreign QRs are
 * rejected. Web never scans (S6) but can display and manage vinculos.
 */

import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync } from 'expo-crypto';

import { StorageKeys, loadObject, saveObject } from '@/services/storage';

export interface Vinculo {
  code: string;
  /** Unique email of the familiar that owns this link. */
  email: string;
  createdAt: string;
}

export interface QrPayload {
  t: 'aam-vinculo';
  code: string;
  email: string;
}

export async function deriveCode(email: string): Promise<string> {
  const digest = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    email.trim().toLowerCase(),
    { encoding: CryptoEncoding.HEX },
  );
  return digest.slice(0, 16);
}

export function buildQrPayload(vinculo: Vinculo): string {
  const payload: QrPayload = { t: 'aam-vinculo', code: vinculo.code, email: vinculo.email };
  return JSON.stringify(payload);
}

export function parseQrPayload(text: string): QrPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<QrPayload>;
    if (
      parsed &&
      parsed.t === 'aam-vinculo' &&
      typeof parsed.code === 'string' &&
      parsed.code.length > 0 &&
      typeof parsed.email === 'string'
    ) {
      return parsed as QrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

async function listVinculos(): Promise<Vinculo[]> {
  return (await loadObject<Vinculo[]>(StorageKeys.vinculos)) ?? [];
}

/** Idempotent: ensures the unique link record for this email exists. */
export async function ensureVinculo(email: string): Promise<Vinculo> {
  const normalized = email.trim().toLowerCase();
  const vinculos = await listVinculos();
  const existing = vinculos.find((vinculo) => vinculo.email === normalized);
  if (existing) return existing;

  const created: Vinculo = {
    code: await deriveCode(normalized),
    email: normalized,
    createdAt: new Date().toISOString(),
  };
  vinculos.push(created);
  await saveObject(StorageKeys.vinculos, vinculos);
  return created;
}

export async function getVinculo(code: string): Promise<Vinculo | null> {
  const vinculos = await listVinculos();
  return vinculos.find((vinculo) => vinculo.code === code) ?? null;
}

/**
 * Accept a scanned QR payload without any network: the code is derived
 * deterministically from the email, so a device that never saw this link
 * can verify `code === deriveCode(email)` and create its local record.
 * Returns null for fabricated payloads (code does not match the email).
 */
export async function acceptQrPayload(payload: QrPayload): Promise<Vinculo | null> {
  const expected = await deriveCode(payload.email);
  if (expected !== payload.code) return null;
  return ensureVinculo(payload.email);
}
