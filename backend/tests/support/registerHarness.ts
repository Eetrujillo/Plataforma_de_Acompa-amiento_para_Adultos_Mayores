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
import type { VerificationStorePort } from '../../src/modules/auth/application/RequestEmailVerification.ts';
import type { VerificationTokenTarget } from '../../src/modules/auth/application/RequestEmailVerification.ts';
import type {
  AuthLogger,
  EmailSenderPort,
  VerificationEmailMessage,
} from '../../src/modules/auth/application/EmailSenderPort.ts';

export const TERMS_VERSION = '9.9-test';
export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

/**
 * Doble en memoria de los puertos de persistencia (UserRepository de HU-001 y
 * VerificationStore de HU-002) sobre el mismo almacén: así el registro y la
 * verificación comparten estado, igual que el repositorio real de Mongoose.
 * `saveError` y `saveTokenError` permiten simular fallos del adaptador sin Mongo.
 */
export class InMemoryUserRepository implements UserRepositoryPort, VerificationStorePort {
  readonly users = new Map<string, StoredUser>();
  readonly consents = new Map<string, ConsentEvidence>();
  readonly savedEntities: UserEntity[] = [];
  /** Email → token de verificación vigente (hash + vencimiento), como el documento User. */
  readonly savedTokens = new Map<string, { tokenHash: string; expiresAt: Date }>();
  readonly verifiedAt = new Map<string, Date>();
  findByEmailCalls = 0;
  saveCalls = 0;
  saveTokenCalls = 0;
  stateLookups = 0;
  saveError: Error | null = null;
  saveTokenError: Error | null = null;

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

  async saveVerificationToken(
    email: string,
    token: { tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    this.saveTokenCalls += 1;
    if (this.saveTokenError !== null) throw this.saveTokenError;
    this.savedTokens.set(email, { tokenHash: token.tokenHash, expiresAt: token.expiresAt });
  }

  async findEmailVerificationState(
    email: string,
  ): Promise<{ fullName: string; emailVerifiedAt: Date | null } | null> {
    this.stateLookups += 1;
    const user = this.users.get(email);
    if (user === undefined) return null;
    return { fullName: user.fullName, emailVerifiedAt: this.verifiedAt.get(email) ?? null };
  }

  async findByVerificationTokenHash(tokenHash: string): Promise<VerificationTokenTarget | null> {
    for (const [email, token] of this.savedTokens) {
      if (token.tokenHash !== tokenHash) continue;
      const user = this.users.get(email);
      if (user === undefined) return null;
      return {
        id: user.id,
        email,
        fullName: user.fullName,
        tokenHash,
        expiresAt: token.expiresAt,
        emailVerifiedAt: this.verifiedAt.get(email) ?? null,
      };
    }
    return null;
  }

  async markEmailVerified(email: string, verifiedAt: Date): Promise<StoredUser> {
    this.verifiedAt.set(email, verifiedAt);
    // Un solo uso: el token queda invalidado al marcar el correo como verificado.
    this.savedTokens.delete(email);
    const user = this.users.get(email);
    if (user === undefined) throw new Error('markEmailVerified: la cuenta no existe');
    return user;
  }
}

export class FakePasswordHasher implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return `$2a$10$fakestoredhashfor${plain}`;
  }
}

/**
 * Doble del puerto de correo: acumula los mensajes enviados en `sent`.
 * `failNext` simula un envío caído sin SMTP real.
 */
export class FakeEmailSender implements EmailSenderPort {
  readonly sent: VerificationEmailMessage[] = [];
  failNext = false;

  async sendVerificationEmail(
    message: VerificationEmailMessage,
  ): Promise<{ delivered: boolean; channel: 'smtp' | 'console' }> {
    if (this.failNext) return { delivered: false, channel: 'smtp' };
    this.sent.push(message);
    return { delivered: true, channel: 'smtp' };
  }
}

/** Logger capturado: permite afirmar sobre lo que el backend escribe (S6). */
export class CapturingLogger implements AuthLogger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  warn(message: string): void {
    this.warns.push(message);
  }
}

export interface Harness {
  app: Express;
  repo: InMemoryUserRepository;
  hasher: PasswordHasherPort;
  sender: FakeEmailSender;
  logger: CapturingLogger;
  /** Reloj mutable de la aplicación: cambiá `.now` para simular el paso del tiempo. */
  clock: { now: Date };
}

export interface HarnessOptions {
  /** Opciones de la aplicación (saltos de proxy confiables). */
  app?: AppOptions;
  /** Error que rechaza `repo.save`, para simular fallos del adaptador. */
  saveError?: Error;
  /** Error que rechaza `repo.saveVerificationToken` (S1: no rompe el registro). */
  saveTokenError?: Error;
  /** Hasher alternativo (HU-001 S7 usa el bcrypt real). */
  hasher?: PasswordHasherPort;
  /** APP_URL con el que se arma el enlace de verificación (S5). */
  appUrl?: string;
  emailVerificationTtlHours?: number;
  resendThrottleMax?: number;
  resendThrottleWindowMinutes?: number;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const repo = new InMemoryUserRepository();
  if (options.saveError !== undefined) repo.saveError = options.saveError;
  if (options.saveTokenError !== undefined) repo.saveTokenError = options.saveTokenError;
  const hasher = options.hasher ?? new FakePasswordHasher();
  const sender = new FakeEmailSender();
  const logger = new CapturingLogger();
  const clock = { now: FIXED_NOW };
  const app = buildApp(
    {
      userRepository: repo,
      verificationStore: repo,
      passwordHasher: hasher,
      clock: () => clock.now,
      termsVersion: TERMS_VERSION,
      emailSender: sender,
      logger,
      appUrl: options.appUrl ?? 'https://app.ejemplo.test',
      emailVerificationTtlHours: options.emailVerificationTtlHours ?? 24,
      resendThrottleMax: options.resendThrottleMax ?? 3,
      resendThrottleWindowMinutes: options.resendThrottleWindowMinutes ?? 60,
    },
    options.app,
  );
  return { app, repo, hasher, sender, logger, clock };
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
