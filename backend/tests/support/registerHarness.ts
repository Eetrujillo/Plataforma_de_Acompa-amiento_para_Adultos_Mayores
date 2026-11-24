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
import { InMemorySeniorRepository } from './seniorFakes.ts';
import {
  InMemoryPairingTokenRepository,
} from './pairingFakes.ts';
import type { PairingQrEncoderPort } from '../../src/modules/pairing/application/PairingQrEncoderPort.ts';
import { createPairingQrEncoder, PAIRING_TOKEN_TTL_MINUTES } from '../../src/modules/pairing/index.ts';
import type {
  ConsentEvidence,
  UserEntity,
} from '../../src/modules/auth/domain/User.ts';
import type { LoginCredentials, LoginStorePort, RegisterFailedLoginConfig } from '../../src/modules/auth/application/Login.ts';
import type { NextLockoutState } from '../../src/modules/auth/domain/loginLockout.ts';
import type { PasswordComparerPort } from '../../src/modules/auth/application/Login.ts';
import type { SessionUser as SessionUserShape, SessionUserReaderPort } from '../../src/shared/middlewares/authMiddleware.ts';
import type { VerificationStorePort } from '../../src/modules/auth/application/RequestEmailVerification.ts';
import type { VerificationTokenTarget } from '../../src/modules/auth/application/RequestEmailVerification.ts';
import type {
  AuthLogger,
  EmailDeliveryResult,
  EmailSenderPort,
  PasswordResetEmailMessage,
  VerificationEmailMessage,
} from '../../src/modules/auth/application/EmailSenderPort.ts';
import type { PasswordResetStorePort } from '../../src/modules/auth/application/RequestPasswordReset.ts';

export const TERMS_VERSION = '9.9-test';
export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
/** Secreto JWT de test: los tests firman y verifican contra este valor (HU-003). */
export const TEST_JWT_SECRET = 'test-secret-con-mas-de-32-bytes-para-hmac-sha256';
/** ips de prueba para el límite por IP (S9), con TRUST_PROXY_HOPS=1. */
export const IP_A = '203.0.113.9';
export const IP_B = '198.51.100.77';

/** Estado de login de un usuario, como el documento User lo guarda. */
export interface StoredLoginState {
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  sessionVersion: number | null;
}

/**
 * Doble en memoria de los puertos de persistencia (UserRepository de HU-001 y
 * VerificationStore de HU-002) sobre el mismo almacén: así el registro y la
 * verificación comparten estado, igual que el repositorio real de Mongoose.
 * `saveError` y `saveTokenError` permiten simular fallos del adaptador sin Mongo.
 */
export class InMemoryUserRepository implements UserRepositoryPort, VerificationStorePort, LoginStorePort, SessionUserReaderPort, PasswordResetStorePort {
  readonly users = new Map<string, StoredUser>();
  readonly consents = new Map<string, ConsentEvidence>();
  readonly savedEntities: UserEntity[] = [];
  /** Email → token de verificación vigente (hash + vencimiento), como el documento User. */
  readonly savedTokens = new Map<string, { tokenHash: string; expiresAt: Date }>();
  readonly verifiedAt = new Map<string, Date>();
  /** Email → hash bcrypt con el que `findCredentialsByEmail` compara (HU-003). */
  private readonly passwordHashes = new Map<string, string | null>();
  /** Email → versión de sesión; null se lee como 0 (jwt-security). */
  private readonly sessionVersions = new Map<string, number | null>();
  findByEmailCalls = 0;
  saveCalls = 0;
  saveTokenCalls = 0;
  stateLookups = 0;
  findCredentialsCalls = 0;
  failedLoginWrites = 0;
  clearedLoginStreaks = 0;
  sessionUserReadCalls = 0;
  /** Email → racha de fallos y bloqueo (HU-003); observable desde los tests. */
  readonly lockoutStates = new Map<string, { failedLoginAttempts: number | null; lockedUntil: Date | null }>();
  saveError: Error | null = null;
  saveTokenError: Error | null = null;

  // HU-004: colección propia de tokens de reset (D1), claveada por tokenHash
  // con la misma disciplina de proyección del adaptador real: userId, email,
  // expiresAt y usedAt, nunca el token en claro.
  readonly passwordResetTokens = new Map<
    string,
    { userId: string; email: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }
  >();
  saveResetTokenCalls = 0;
  forgotStateLookups = 0;
  resetConsumeCalls = 0;
  resetPasswordWrites = 0;
  /**
   * S6: orden de las operaciones del flujo de reset. Pin del "consume antes
   * de tocar la cuenta": en cada flujo completo el `consume` precede a
   * cualquier escritura del documento User.
   */
  readonly resetCalls: string[] = [];
  saveResetTokenError: Error | null = null;
  resetPasswordError: Error | null = null;

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
    // Semilla del estado de login (HU-003): la cuenta nace sin racha ni bloqueo.
    this.passwordHashes.set(user.email, user.passwordHash);
    if (!this.lockoutStates.has(user.email)) {
      this.lockoutStates.set(user.email, { failedLoginAttempts: null, lockedUntil: null });
    }
    return stored;
  }

  /** Helper de test: cuenta sin contraseña (Google) para S1. */
  addAccountWithoutPassword(email: string, fullName: string): void {
    this.users.set(email, { id: randomUUID(), email, fullName, role: 'CAREGIVER' });
    this.passwordHashes.set(email, null);
  }

  /** Helper de test: sube la versión de sesión (simula el reset de HU-004, S7). */
  setSessionVersion(email: string, version: number): void {
    this.sessionVersions.set(email, version);
  }

  /** Helper de test: estado de login observable, sin exponer el hash. */
  loginStateOf(email: string): StoredLoginState {
    const state = this.lockoutStates.get(email);
    return {
      failedLoginAttempts: state?.failedLoginAttempts ?? null,
      lockedUntil: state?.lockedUntil ?? null,
      sessionVersion: this.sessionVersions.get(email) ?? null,
    };
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

  /**
   * C2: canje atómico y condicionado, igual que el `findOneAndUpdate` del
   * adaptador real — sólo triunfa con el hash vigente y el correo aún sin
   * verificar; devuelve `null` en el caso contrario para que `ConfirmEmail`
   * responda el INVALID_TOKEN único.
   */
  async markEmailVerified(
    email: string,
    tokenHash: string,
    verifiedAt: Date,
  ): Promise<StoredUser | null> {
    const user = this.users.get(email);
    const token = this.savedTokens.get(email);
    if (user === undefined || token === undefined || token.tokenHash !== tokenHash) return null;
    // El vencimiento entra en la condición atómica: un token que cruzó su
    // expiresAt no se canjea aunque el chequeo previo lo haya visto vigente.
    if (token.expiresAt.getTime() <= verifiedAt.getTime()) return null;
    if ((this.verifiedAt.get(email) ?? null) !== null) return null;
    this.verifiedAt.set(email, verifiedAt);
    // Un solo uso: el token queda invalidado al marcar el correo como verificado.
    this.savedTokens.delete(email);
    return user;
  }

  // HU-003: las credenciales son la única lectura que trae el hash de la
  // contraseña; ningún otro método lo devuelve.
  async findCredentialsByEmail(email: string): Promise<LoginCredentials | null> {
    this.findCredentialsCalls += 1;
    const stored = this.users.get(email);
    if (stored === undefined) return null;
    const state = this.lockoutStates.get(email);
    return {
      id: stored.id,
      email: stored.email,
      fullName: stored.fullName,
      role: stored.role,
      passwordHash: this.passwordHashes.get(email) ?? null,
      emailVerifiedAt: this.verifiedAt.get(email) ?? null,
      sessionVersion: this.sessionVersions.get(email) ?? null,
      failedLoginAttempts: state?.failedLoginAttempts ?? null,
      lockedUntil: state?.lockedUntil ?? null,
    };
  }

  /**
   * C2: la escritura del doble también es un incremento incondicional por
   * llamada (la misma semántica del `$inc`/pipeline del adaptador real): cada
   * llamada cuenta exactamente un fallo y fija `lockedUntil` al llegar al
   * umbral, devolviendo el estado que quedó guardado. Nada depende de valores
   * leídos antes: 25 llamadas simultáneas persisten exactamente 25.
   */
  async registerFailedLogin(
    email: string,
    config: RegisterFailedLoginConfig,
  ): Promise<NextLockoutState | null> {
    this.failedLoginWrites += 1;
    if (!this.users.has(email)) return null;
    const current = this.lockoutStates.get(email) ?? {
      failedLoginAttempts: null,
      lockedUntil: null,
    };
    // Espeja el pipeline real: un bloqueo ya vencido reinicia la racha.
    const expired = current.lockedUntil !== null && current.lockedUntil.getTime() <= config.now.getTime();
    const attempts = (expired ? 0 : (current.failedLoginAttempts ?? 0)) + 1;
    const lockedUntil =
      attempts >= config.maxAttempts ? new Date(config.now.getTime() + config.lockMs) : null;
    this.lockoutStates.set(email, { failedLoginAttempts: attempts, lockedUntil });
    return { failedLoginAttempts: attempts, lockedUntil };
  }

  async clearFailedLogins(email: string): Promise<void> {
    this.clearedLoginStreaks += 1;
    if (!this.users.has(email)) return;
    this.lockoutStates.set(email, { failedLoginAttempts: 0, lockedUntil: null });
  }

  async findSessionUserById(id: string): Promise<SessionUserShape | null> {
    this.sessionUserReadCalls += 1;
    for (const [email, stored] of this.users) {
      if (stored.id !== id) continue;
      return {
        id: stored.id,
        email: stored.email,
        fullName: stored.fullName,
        role: stored.role,
        sessionVersion: this.sessionVersions.get(email) ?? null,
      };
    }
    return null;
  }

  // ─── HU-004: puerto PasswordResetStore (D1: colección propia) ───────────

  /**
   * S8: pedir otro enlace quema el anterior — toda entrada previa del correo
   * desaparece y sólo el último token emitido queda guardado (S4: sólo el hash).
   */
  async savePasswordResetToken(
    email: string,
    token: { tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    this.saveResetTokenCalls += 1;
    if (this.saveResetTokenError !== null) throw this.saveResetTokenError;
    for (const [hash, doc] of this.passwordResetTokens) {
      if (doc.email === email) this.passwordResetTokens.delete(hash);
    }
    const user = this.users.get(email);
    if (user === undefined) {
      throw new Error(`savePasswordResetToken: sin cuenta para ${email} (bug del caller)`);
    }
    this.passwordResetTokens.set(token.tokenHash, {
      userId: user.id,
      email,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: null,
    });
  }

  /** Estado mínimo para decidir si corresponde enviar (S1), sin exponer el hash. */
  async findPasswordResetState(
    email: string,
  ): Promise<{ fullName: string; passwordHash: string | null } | null> {
    this.forgotStateLookups += 1;
    const user = this.users.get(email);
    if (user === undefined) return null;
    return { fullName: user.fullName, passwordHash: this.passwordHashes.get(email) ?? null };
  }

  /**
   * S6/D3: consumo atómico y previo — una única escritura condicionada
   * (`usedAt: null` + vencimiento vigente) que fija `usedAt`. Devuelve `null`
   * cuando el token no matchea, ya está usado o venció: dos canjes del mismo
   * token no pueden dar dos escrituras.
   */
  async consumePasswordResetToken(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: string; email: string } | null> {
    this.resetConsumeCalls += 1;
    this.resetCalls.push('consume');
    const doc = this.passwordResetTokens.get(tokenHash);
    if (doc === undefined || doc.usedAt !== null || doc.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    this.passwordResetTokens.set(tokenHash, { ...doc, usedAt: new Date(now.getTime()) });
    return { userId: doc.userId, email: doc.email };
  }

  /**
   * D4: una sola escritura — hash nuevo + racha limpiada + `$inc` de
   * sessionVersion (null se lee como 0). El doble registra exactamente una
   * llamada y aplica los tres efectos en esa única llamada. C4: reporta si
   * matcheó una cuenta — la cuenta eliminada antes del canje responde `false`
   * y el caso de uso contesta INVALID_TOKEN, no un 200 mentiroso.
   */
  async resetPassword(email: string, passwordHash: string): Promise<boolean> {
    this.resetPasswordWrites += 1;
    this.resetCalls.push('resetPassword');
    if (this.resetPasswordError !== null) throw this.resetPasswordError;
    if (!this.users.has(email)) return false;
    this.passwordHashes.set(email, passwordHash);
    this.lockoutStates.set(email, { failedLoginAttempts: 0, lockedUntil: null });
    this.sessionVersions.set(email, (this.sessionVersions.get(email) ?? 0) + 1);
    return true;
  }
}

export class FakePasswordHasher implements PasswordHasherPort, PasswordComparerPort {
  async hash(plain: string): Promise<string> {
    return `$2a$10$fakestoredhashfor${plain}`;
  }

  /** Compara contra el formato del hash de arriba (HU-003); jamás bcrypt real. */
  async compare(plain: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `$2a$10$fakestoredhashfor${plain}`;
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

  async sendPasswordResetEmail(
    message: PasswordResetEmailMessage,
  ): Promise<EmailDeliveryResult> {
    if (this.explodeReset) throw new Error('smtp roto');
    if (this.failNextReset) return { delivered: false, channel: 'smtp' };
    this.passwordResets.push(message);
    return { delivered: true, channel: 'smtp' };
  }

  // HU-004: rama de reset en el doble — acumula por separado. `failNextReset`
  // simula un envío caído (delivered:false) y `explodeReset` una excepción;
  // las dos comprobaciones de S10 (el 202 no se rompe y queda un warn).
  readonly passwordResets: PasswordResetEmailMessage[] = [];
  failNextReset = false;
  explodeReset = false;
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
  /** HU-005/HU-007: doble del puerto de seniors, compartido con la app. */
  seniorRepo: InMemorySeniorRepository;
  /** HU-008: doble del almacén de tokens de vinculación, compartido con la app. */
  pairingRepo: InMemoryPairingTokenRepository;
  /** HU-008: codificador del QR inyectado en la app (real por default). */
  qrEncoder: PairingQrEncoderPort;
  hasher: PasswordHasherPort;
  sender: FakeEmailSender;
  logger: CapturingLogger;
  /** Reloj mutable de la aplicación: cambiá `.now` para simular el paso del tiempo. */
  clock: { now: Date };
}

export interface HarnessOptions {
  /** Opciones de la aplicación (saltos de proxy confiables). */
  app?: AppOptions;
  /** HU-005/HU-007: repositorio de seniors compartido con la app (sembrar vínculos). */
  seniorRepository?: InMemorySeniorRepository;
  /** HU-008: almacén de tokens de vinculación compartido con la app. */
  pairingTokenRepository?: InMemoryPairingTokenRepository;
  /** HU-008: codificador de QR alternativo (FailingQrEncoder para S4). */
  qrEncoder?: PairingQrEncoderPort;
  /** HU-008: PAIRING_TTL_MINUTES (D7, default = la constante del dominio). */
  pairingTtlMinutes?: number;
  /** Repositorio compartido: para probar el bloqueo a través de un "reinicio" (S4). */
  repository?: InMemoryUserRepository;
  /** Error que rechaza `repo.save`, para simular fallos del adaptador. */
  saveError?: Error;
  /** Error que rechaza `repo.saveVerificationToken` (S1: no rompe el registro). */
  saveTokenError?: Error;
  /** Hasher alternativo (HU-001 S7 usa el bcrypt real; el login exige comparador). */
  hasher?: PasswordHasherPort & PasswordComparerPort;
  /** APP_URL con el que se arma el enlace de verificación (S5). */
  appUrl?: string;
  emailVerificationTtlHours?: number;
  resendThrottleMax?: number;
  resendThrottleWindowMinutes?: number;
  /** HU-004: TTL del enlace de reset (PASSWORD_RESET_TTL_MINUTES, default 60). */
  passwordResetTtlMinutes?: number;
  /** HU-004: límite propio de forgot-password (separado del de reenvío, S9). */
  forgotThrottleMax?: number;
  forgotThrottleWindowMinutes?: number;
  /** Error que rechaza `repo.savePasswordResetToken` (S10: no rompe el 202). */
  saveResetTokenError?: Error;
  /** HU-003: configuración de sesión y bloqueo; defaults = los del contrato. */
  jwtSecret?: string;
  jwtExpiresIn?: string;
  lockoutMaxAttempts?: number;
  lockoutMinutes?: number;
  loginIpMaxAttempts?: number;
  loginIpWindowMinutes?: number;
}

export function makeHarness(options: HarnessOptions = {}): Harness {
  const repo = options.repository ?? new InMemoryUserRepository();
  if (options.saveError !== undefined) repo.saveError = options.saveError;
  if (options.saveTokenError !== undefined) repo.saveTokenError = options.saveTokenError;
  if (options.saveResetTokenError !== undefined) {
    repo.saveResetTokenError = options.saveResetTokenError;
  }
  const hasher: PasswordHasherPort & PasswordComparerPort =
    options.hasher ?? new FakePasswordHasher();
  const sender = new FakeEmailSender();
  const logger = new CapturingLogger();
  const clock = { now: FIXED_NOW };
  const seniorRepository = options.seniorRepository ?? new InMemorySeniorRepository();
  const pairingTokenRepository =
    options.pairingTokenRepository ?? new InMemoryPairingTokenRepository();
  const qrEncoder = options.qrEncoder ?? createPairingQrEncoder();
  const app = buildApp(
    {
      userRepository: repo,
      verificationStore: repo,
      loginStore: repo,
      sessionUserReader: repo,
      passwordHasher: hasher,
      clock: () => clock.now,
      termsVersion: TERMS_VERSION,
      emailSender: sender,
      logger,
      appUrl: options.appUrl ?? 'https://app.ejemplo.test',
      emailVerificationTtlHours: options.emailVerificationTtlHours ?? 24,
      resendThrottleMax: options.resendThrottleMax ?? 3,
      resendThrottleWindowMinutes: options.resendThrottleWindowMinutes ?? 60,
      // HU-004: restablecimiento de contraseña; el repositorio real satisface
      // el puerto junto con los otros (colección propia, D1).
      passwordResetStore: repo,
      passwordResetTtlMinutes: options.passwordResetTtlMinutes ?? 60,
      forgotThrottleMax: options.forgotThrottleMax ?? 3,
      forgotThrottleWindowMinutes: options.forgotThrottleWindowMinutes ?? 60,
      // HU-003: sesión de test determinista y límites del contrato, salvo override.
      jwtSecret: options.jwtSecret ?? TEST_JWT_SECRET,
      jwtExpiresIn: options.jwtExpiresIn ?? '7d',
      lockoutMaxAttempts: options.lockoutMaxAttempts ?? 5,
      lockoutMinutes: options.lockoutMinutes ?? 15,
      loginIpMaxAttempts: options.loginIpMaxAttempts ?? 20,
      loginIpWindowMinutes: options.loginIpWindowMinutes ?? 15,
      // HU-005/HU-007: el mismo doble de seniors que exponen los tests.
      seniorRepository,
      // HU-008: emisión del QR con los dobles (o el codificador real). El lector
      // es el doble de seniors: en producción el adaptador de pairing añade la
      // detección del documento sin `linkStatus` (D12), pineada contra Mongo.
      pairingSeniorReader: seniorRepository,
      pairingTokenRepository,
      qrEncoder,
      // D7: el default es la constante del dominio, no otro número a mano.
      pairingTtlMinutes: options.pairingTtlMinutes ?? PAIRING_TOKEN_TTL_MINUTES,
    },
    options.app,
  );
  return {
    app,
    repo,
    seniorRepo: seniorRepository,
    pairingRepo: pairingTokenRepository,
    qrEncoder,
    hasher,
    sender,
    logger,
    clock,
  };
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
  /** Headers de la respuesta (HU-008: Cache-Control de S21/D10). */
  headers: Headers;
}

export async function post(
  base: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<PostResult> {
  return request('POST', base, path, JSON.stringify(body), headers);
}

/** GET con headers opcionales (HU-003: GET /api/auth/me con Bearer). */
export async function get(
  base: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<PostResult> {
  return request('GET', base, path, null, headers);
}

async function request(
  method: 'GET' | 'POST',
  base: string,
  path: string,
  body: string | null,
  headers: Record<string, string>,
): Promise<PostResult> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === null ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === null ? {} : { body }),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
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
