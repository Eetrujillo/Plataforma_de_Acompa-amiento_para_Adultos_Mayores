import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import type { Express } from 'express';

import { buildApp } from '../../src/app.ts';
import type { AppOptions } from '../../src/app.ts';
import type {
  PasswordHasherPort,
  StoredUser,
  UserRepositoryPort,
} from '../../src/modules/auth/application/RegisterCaregiver.ts';
import type { ConsentEvidence, UserEntity } from '../../src/modules/auth/domain/User.ts';

export const TERMS_VERSION = '9.9-test';
export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

/**
 * Doble en memoria del puerto UserRepository. `saveError` permite simular un
 * fallo del adaptador (por ejemplo la carrera que rompe el índice único) sin
 * Mongo real.
 */
export class InMemoryUserRepository implements UserRepositoryPort {
  readonly users = new Map<string, StoredUser>();
  readonly consents = new Map<string, ConsentEvidence>();
  readonly savedEntities: UserEntity[] = [];
  findByEmailCalls = 0;
  saveCalls = 0;
  saveError: Error | null = null;

  async findByEmail(email: string): Promise<StoredUser | null> {
    this.findByEmailCalls += 1;
    return this.users.get(email) ?? null;
  }

  async save(user: UserEntity): Promise<StoredUser> {
    this.saveCalls += 1;
    if (this.saveError !== null) throw this.saveError;
    this.savedEntities.push(user);
    this.consents.set(user.email, user.consent);
    const stored: StoredUser = {
      id: randomUUID(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    this.users.set(user.email, stored);
    return stored;
  }
}

export class FakePasswordHasher implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return `$2a$10$fakestoredhashfor${plain}`;
  }
}

export interface Harness {
  app: Express;
  repo: InMemoryUserRepository;
  hasher: PasswordHasherPort;
}

export interface HarnessOptions {
  /** Opciones de la aplicación (saltos de proxy confiables). */
  app?: AppOptions;
  /** Error que rechaza `repo.save`, para simular fallos del adaptador. */
  saveError?: Error;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const repo = new InMemoryUserRepository();
  if (options.saveError !== undefined) repo.saveError = options.saveError;
  const hasher = new FakePasswordHasher();
  const app = buildApp(
    {
      userRepository: repo,
      passwordHasher: hasher,
      clock: () => FIXED_NOW,
      termsVersion: TERMS_VERSION,
    },
    options.app,
  );
  return { app, repo, hasher };
}

export async function withServer(
  harness: Harness,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer(harness.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export interface PostResult {
  status: number;
  json: unknown;
  text: string;
}

export async function post(
  base: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<PostResult> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

export const VALID_BODY = {
  fullName: 'Esteban Trujillo',
  email: 'cuidador@example.com',
  password: 'clave1234',
  acceptedTerms: true,
};

export interface ErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

export function errorEnvelope(json: unknown): ErrorEnvelope {
  assert.ok(
    json !== null && typeof json === 'object' && 'error' in json,
    `se esperaba el sobre de error, llegó: ${JSON.stringify(json)}`,
  );
  const error = (json as { error: unknown }).error;
  assert.ok(error !== null && typeof error === 'object' && 'code' in error && 'message' in error);
  const envelope = error as { code: unknown; message: unknown; details?: unknown };
  assert.equal(typeof envelope.code, 'string');
  assert.equal(typeof envelope.message, 'string');
  return {
    code: envelope.code as string,
    message: envelope.message as string,
    details: envelope.details,
  };
}
