/**
 * HU-009 / T1-T4 — canje del QR de vinculación.
 *
 * T1: reglas puras del estado del token y mensajes byte-exactos (S14-S17, S22).
 * T2/T3: caso de uso `RedeemPairingToken` — orden D5/D6, bloqueo de D8, throttle
 *     de D9, sesión de D10 y errores de S14, con los dobles de `pairingFakes.ts`.
 * T4: HTTP — ruta pública `POST /api/pairing/redeem`, cuerpo
 *     `{ token, acceptedTerms }`, respuesta 201 exacta de S13, bloqueos y
 *     mensajes byte-exactos sobre el sobre de errores.
 *
 * La disciplina TDD está en el encabezado del trabajo: este archivo se corrió
 * en ROJO (módulos inexistentes) antes de escribir el caso de uso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import {
  FIXED_NOW,
  IP_A,
  IP_B,
  TERMS_VERSION,
  TEST_JWT_SECRET,
  VALID_BODY,
  errorEnvelope,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';
import type { Harness } from './support/registerHarness.ts';
import { JwtTokenService } from '../src/modules/auth/infrastructure/JwtTokenService.ts';
import { LoginIpThrottle } from '../src/modules/auth/application/LoginIpThrottle.ts';
import { evaluatePairingTokenState, hashPairingToken } from '../src/modules/pairing/domain/pairingToken.ts';
import {
  PAIRING_TOKEN_INVALID_MESSAGE,
  PAIRING_TOKEN_NOT_FOUND_MESSAGE,
  PAIRING_TOKEN_ALREADY_USED_MESSAGE,
  SENIOR_ALREADY_LINKED_MESSAGE,
} from '../src/modules/pairing/application/pairingMessages.ts';
import { RedeemPairingToken } from '../src/modules/pairing/application/RedeemPairingToken.ts';
import {
  InMemoryPairingTokenRepository,
  InMemoryRedeemSeniorWriter,
  RecordingQrEncoder,
  StaticRedeemReader,
} from './support/pairingFakes.ts';

const PAIRING = '/api/pairing';
const REDEEM = `${PAIRING}/redeem`;
const NOW = FIXED_NOW;

const SENIOR_ID = '507f1f77bcf86cd799439011';
const OTHER_SENIOR_ID = '507f1f77bcf86cd799439022';
const CAREGIVER_ID = '507f1f77bcf86cd7994390aa';
const STRANGER_ID = '507f1f77bcf86cd7994390bb';
const PROFILE_BODY = {
  fullName: 'Rosa Pérez',
  timezone: 'America/Bogota',
  bloodType: 'O+',
  allergies: ['penicilina'],
  conditions: ['hipertensión'],
  medications: ['losartán'],
  emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
};

/** S13/D12: los tres mensajes del canje en inglés, byte-exactos. */
const INVALID_MESSAGE = 'pairing token is invalid or expired';
const NOT_FOUND_MESSAGE = 'pairing token not found';
const ALREADY_USED_MESSAGE = 'pairing token already used';
/** S15: este sí está en español porque también lo muestra el panel. */
const LINKED_MESSAGE = 'El perfil ya está vinculado a un dispositivo';
const LOCKED_MESSAGE =
  'Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.';
const IP_LIMIT_MESSAGE =
  'Demasiados intentos desde tu conexión. Esperá unos minutos antes de volver a intentar.';

interface UseCaseOptions {
  /** REDEEM_IP_MAX_ATTEMPTS / REDEEM_IP_WINDOW_MINUTES (D9). */
  ipMax?: number;
  ipWindowSeconds?: number;
  termsVersion?: string;
}

interface RedeemDeps {
  reader: StaticRedeemReader;
  tokens: InMemoryPairingTokenRepository;
  writer: InMemoryRedeemSeniorWriter;
  throttle: LoginIpThrottle;
  sessionToken: JwtTokenService;
  advance(seconds: number): void;
}

function makeUseCase(options: UseCaseOptions = {}): { useCase: RedeemPairingToken; deps: RedeemDeps } {
  let now = new Date(NOW.getTime());
  const reader = new StaticRedeemReader();
  const tokens = new InMemoryPairingTokenRepository();
  const writer = new InMemoryRedeemSeniorWriter();
  const throttle = new LoginIpThrottle({ now: () => now }, {
    max: options.ipMax ?? 20,
    windowMs: (options.ipWindowSeconds ?? 15 * 60) * 1000,
  });
  const sessionToken = new JwtTokenService(TEST_JWT_SECRET, '7d');
  const useCase = new RedeemPairingToken({
    tokenRepository: tokens,
    seniorReader: reader,
    seniorWriter: writer,
    lockout: writer,
    sessionToken,
    ipThrottle: throttle,
    lockoutConfig: { maxAttempts: 5, lockMs: 15 * 60_000 },
    recoveryMs: 15 * 60_000,
    clock: { now: () => now },
    termsVersion: options.termsVersion ?? '1.0-test',
  });
  return {
    useCase,
    deps: {
      reader,
      tokens,
      writer,
      throttle,
      sessionToken,
      advance(seconds: number) {
        now = new Date(now.getTime() + seconds * 1000);
      },
    },
  };
}

/** Token sembrado por hash, como lo habría dejado la emisión de HU-008. */
async function seedToken(
  deps: RedeemDeps,
  token: string,
  overrides: { seniorId?: string; caregiverId?: string; expiresAt?: Date } = {},
): Promise<void> {
  await deps.tokens.create({
    seniorId: overrides.seniorId ?? SENIOR_ID,
    caregiverId: overrides.caregiverId ?? CAREGIVER_ID,
    tokenHash: hashPairingToken(token),
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 24 * 60 * 60_000),
  });
}

/** Siembra el perfil del lector del canje y su fila en el escritor en memoria. */
function seedProfile(
  deps: RedeemDeps,
  overrides: {
    seniorId?: string;
    caregiverId?: string;
    linkStatus?: 'PENDING' | 'LINKED';
    phone?: string | null;
    emailVerified?: boolean;
  } = {},
): void {
  const seniorId = overrides.seniorId ?? SENIOR_ID;
  deps.reader.seed(
    {
      id: seniorId,
      email: `senior+${seniorId}@seniors.local`,
      fullName: 'Rosa Pérez',
      linkStatus: overrides.linkStatus ?? 'PENDING',
      emailVerifiedAt: overrides.emailVerified === false ? null : NOW,
      phone: overrides.phone === undefined ? null : overrides.phone,
      timezone: 'America/Bogota',
      sessionVersion: null,
      createdAt: NOW,
    },
    overrides.caregiverId ?? CAREGIVER_ID,
  );
  deps.writer.seed(seniorId, { linkStatus: overrides.linkStatus ?? 'PENDING' });
}

interface AppErr {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

async function rejectsApp(
  promise: Promise<unknown>,
  expected: { statusCode: number; code?: string; message?: string; details?: unknown },
): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => {
      const appError = error as AppErr;
      assert.equal(appError.statusCode, expected.statusCode);
      if (expected.code !== undefined) assert.equal(appError.code, expected.code);
      if (expected.message !== undefined) assert.equal(appError.message, expected.message);
      if (expected.details !== undefined) assert.deepEqual(appError.details, expected.details);
      return true;
    },
  );
}

const IP = '127.0.0.1';

function command(
  overrides: Partial<{ token: unknown; acceptedTerms: boolean; ipAddress: string }> = {},
): { token: unknown; acceptedTerms: boolean; ipAddress: string } {
  return { token: 'r'.repeat(43), acceptedTerms: true, ipAddress: IP, ...overrides };
}

// ─── T1: dominio y mensajes ──────────────────────────────────────────────────

test('S15/D12: los tres mensajes del canje van en inglés y el de vinculado en español, byte-exactos', () => {
  assert.equal(PAIRING_TOKEN_INVALID_MESSAGE, INVALID_MESSAGE);
  assert.equal(PAIRING_TOKEN_NOT_FOUND_MESSAGE, NOT_FOUND_MESSAGE);
  assert.equal(PAIRING_TOKEN_ALREADY_USED_MESSAGE, ALREADY_USED_MESSAGE);
  assert.equal(SENIOR_ALREADY_LINKED_MESSAGE, LINKED_MESSAGE);
});

test('T1/S16: el estado del token es reclamable, vencido, invalidado o usado', () => {
  const future = new Date(NOW.getTime() + 60_000);
  const past = new Date(NOW.getTime() - 60_000);
  assert.equal(
    evaluatePairingTokenState({ expiresAt: future, usedAt: null, invalidatedAt: null }, NOW),
    'REDEEMABLE',
  );
  assert.equal(
    evaluatePairingTokenState({ expiresAt: past, usedAt: null, invalidatedAt: null }, NOW),
    'EXPIRED',
  );
  // El vencimiento cierra al instante exacto (escritura condicional `expiresAt > now`).
  assert.equal(
    evaluatePairingTokenState({ expiresAt: NOW, usedAt: null, invalidatedAt: null }, NOW),
    'EXPIRED',
  );
  assert.equal(
    evaluatePairingTokenState({ expiresAt: future, usedAt: null, invalidatedAt: NOW }, NOW),
    'INVALIDATED',
  );
  assert.equal(
    evaluatePairingTokenState({ expiresAt: future, usedAt: NOW, invalidatedAt: null }, NOW),
    'USED',
  );
  // Ya usado manda sobre la expiración: es el 409 de S14, no el 400.
  assert.equal(
    evaluatePairingTokenState({ expiresAt: past, usedAt: NOW, invalidatedAt: null }, NOW),
    'USED',
  );
});

// ─── T3: caso de uso ────────────────────────────────────────────────────────

test('S4/S13/D10: el canje firma la sesión con el puerto de auth y devuelve el objeto exacto', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'valid-token-'.repeat(4).slice(0, 43);
  await seedToken(deps, token);
  seedProfile(deps);

  const result = await useCase.execute(command({ token }));

  const claims = jwt.verify(result.token, TEST_JWT_SECRET) as Record<string, unknown>;
  assert.equal(claims['sub'], SENIOR_ID);
  assert.equal(claims['role'], 'SENIOR');
  assert.equal(claims['email'], `senior+${SENIOR_ID}@seniors.local`);
  assert.equal(claims['sv'], 0);
  assert.deepEqual(result.senior, {
    id: SENIOR_ID,
    email: `senior+${SENIOR_ID}@seniors.local`,
    fullName: 'Rosa Pérez',
    role: 'SENIOR',
    phone: null,
    caregiverId: CAREGIVER_ID,
    emailVerified: true,
    createdAt: NOW,
    linkStatus: 'LINKED',
    timezone: 'America/Bogota',
  });
  // S20: el objeto senior lleva exactamente los campos de S13 — nada de ficha.
  assert.deepEqual(Object.keys(result.senior).sort(), [
    'caregiverId', 'createdAt', 'email', 'emailVerified', 'fullName', 'id', 'linkStatus', 'phone', 'role', 'timezone',
  ]);
  // D4: la evidencia viaja en la MISMA escritura que LINKED.
  assert.equal(deps.writer.consentWriteCalls, 1);
  assert.deepEqual(deps.writer.consentWrites, [
    { seniorId: SENIOR_ID, acceptedTermsAt: NOW, termsVersion: '1.0-test', ipAddress: IP },
  ]);
});

test('S8/S16: un segundo canje recibe el 409 genérico; usedAt queda fijo y invalidatedAt intacto', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 's'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  await useCase.execute(command({ token }));

  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 409,
    code: 'CONFLICT',
    message: ALREADY_USED_MESSAGE,
  });

  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  assert.ok(record.usedAt !== null);
  assert.equal(record.invalidatedAt, null, 'usedAt e invalidatedAt son hechos distintos');
  assert.equal(deps.writer.consentWriteCalls, 1, 'un canje, una sola escritura de vínculo');
});

test('S14: token vencido → 400 VALIDATION_ERROR genérico; el perfil no se escribe', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'e'.repeat(43);
  await seedToken(deps, token, { expiresAt: new Date(NOW.getTime() - 1_000) });
  seedProfile(deps);

  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: INVALID_MESSAGE,
  });
  assert.equal(deps.writer.consentWriteCalls, 0);
  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  assert.equal(record.usedAt, null, 'vencido no implica quemado');
});

test('S14: token invalidado (reemplazado por una emisión posterior) → 400 genérico', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'i'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  deps.tokens.tokens.set(hashPairingToken(token), { ...record, invalidatedAt: NOW });

  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: INVALID_MESSAGE,
  });
});

test('S14: token bien formado desconocido → 404 NOT_FOUND', async () => {
  const { useCase, deps } = makeUseCase();
  seedProfile(deps); // el perfil existe, pero el token no: 404, no 409.

  await rejectsApp(useCase.execute(command({ token: 'u'.repeat(43) })), {
    statusCode: 404,
    code: 'NOT_FOUND',
    message: NOT_FOUND_MESSAGE,
  });
});

test('S12/S22: token malformado → 400 VALIDATION_ERROR sin tocar la base', async () => {
  const { useCase, deps } = makeUseCase();

  await rejectsApp(useCase.execute(command({ token: 'corto' })), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: INVALID_MESSAGE,
  });
  await rejectsApp(useCase.execute(command({ token: 42 })), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: INVALID_MESSAGE,
  });
  assert.equal(
    deps.tokens.findByHashCalls + deps.tokens.claimCalls,
    0,
    'la forma se rechaza sin consultas ni escrituras',
  );
});

test('S18/D5: si la escritura del perfil falla después del reclamo, el token queda quemado', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'f'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  deps.writer.markLinkedError = new Error('la base se cayó');

  await assert.rejects(useCase.execute(command({ token })), /la base se cayó/);

  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  assert.ok(record.usedAt !== null, 'falla cerrado: el token ya quedó canjeado');
  assert.equal(deps.writer.consentWriteCalls, 1, 'se intentó la escritura del vínculo una vez');
});

test('S17/D6: perfil ya vinculado → 409 SENIOR_ALREADY_LINKED y el token no se quema', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'l'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps, { linkStatus: 'LINKED' });

  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 409,
    code: 'SENIOR_ALREADY_LINKED',
    message: LINKED_MESSAGE,
  });
  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  assert.equal(record.usedAt, null, 'el QR no se quema');
  assert.equal(deps.writer.consentWriteCalls, 0);
});

test('S17: perfil ajeno o inexistente responde igual que un token consumido (409 genérico)', async () => {
  const { useCase, deps } = makeUseCase();
  seedProfile(deps); // autorizado sólo para CAREGIVER_ID

  // Token de otro familiar: el perfil no se resuelve para él.
  const foreign = 'x'.repeat(43);
  await seedToken(deps, foreign, { caregiverId: STRANGER_ID });
  await rejectsApp(useCase.execute(command({ token: foreign })), {
    statusCode: 409,
    code: 'CONFLICT',
    message: ALREADY_USED_MESSAGE,
  });

  // Token hacia un perfil que ya no existe en absoluto.
  const ghost = 'y'.repeat(43);
  await seedToken(deps, ghost, { seniorId: OTHER_SENIOR_ID });
  await rejectsApp(useCase.execute(command({ token: ghost })), {
    statusCode: 409,
    code: 'CONFLICT',
    message: ALREADY_USED_MESSAGE,
  });

  // En ningún caso se quemó nada (el 409 genérico llega antes del reclamo).
  assert.deepEqual([...deps.tokens.tokens.values()].map((entry) => entry.usedAt), [null, null]);
});

test('S8/D7: dos canjes de carreras distintas no producen dos vínculos', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'z'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);

  const settled = await Promise.allSettled([
    useCase.execute(command({ token })),
    useCase.execute(command({ token })),
  ]);
  const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'sólo el pedido que gana la carrera sigue');
  assert.equal(deps.writer.consentWriteCalls, 1, 'nunca dos vínculos');
  assert.equal(deps.writer.seniors.get(SENIOR_ID)?.linkStatus, 'LINKED');
  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 409,
    code: 'CONFLICT',
    message: ALREADY_USED_MESSAGE,
  });
});

test('D3/ley-1581: sin la bandera de consentimiento no hay canje ni escritura', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'a'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);

  await rejectsApp(useCase.execute(command({ token, acceptedTerms: false })), {
    statusCode: 400,
    code: 'TERMS_NOT_ACCEPTED',
  });
  assert.equal(
    deps.tokens.findByHashCalls + deps.tokens.claimCalls,
    0,
    'el rechazo por consentimiento ocurre antes de mirar la base',
  );
  const record = deps.tokens.tokens.get(hashPairingToken(token));
  assert.ok(record !== undefined);
  assert.equal(record.usedAt, null, 'nada se reclamó');
  assert.equal(deps.writer.consentWriteCalls, 0, 'nada se escribió');
});

// ─── D8: bloqueo por perfil ─────────────────────────────────────────────────

test('S7/D8: cinco fallos consecutivos bloquean el perfil 15 minutos con 429 ACCOUNT_LOCKED', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'b'.repeat(43);
  await seedToken(deps, token, { expiresAt: new Date(NOW.getTime() - 60_000) });
  seedProfile(deps); // perfil pendiente; el token venció: cada intento es un fallo

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await rejectsApp(useCase.execute(command({ token })), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: INVALID_MESSAGE,
    });
  }
  // El quinto fallo dispara el bloqueo y YA responde 429 (como el login).
  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 429,
    code: 'ACCOUNT_LOCKED',
    message: LOCKED_MESSAGE,
    details: { retryAfterSeconds: 900 },
  });
  const profile = deps.writer.seniors.get(SENIOR_ID);
  assert.ok(profile !== undefined);
  assert.equal(profile.redeemFailedAttempts, 5);
  assert.ok(profile.redeemLockedUntil !== null);

  // El intento bloqueado no se cuenta (skill rate-limiting regla 6).
  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 429,
    code: 'ACCOUNT_LOCKED',
    message: LOCKED_MESSAGE,
    details: { retryAfterSeconds: 900 },
  });
  assert.equal(deps.writer.seniors.get(SENIOR_ID)?.redeemFailedAttempts, 5);
});

test('S7: un canje exitoso limpia el contador del bloqueo', async () => {
  const { useCase, deps } = makeUseCase();
  seedProfile(deps);
  // Dos fallos con tokens vencidos.
  for (const [index, suffix] of ['1', '2'].entries()) {
    const dead = suffix.padEnd(43, '9');
    await seedToken(deps, dead, { expiresAt: new Date(NOW.getTime() - 60_000) });
    await rejectsApp(useCase.execute(command({ token: dead })), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    void index;
  }
  // Un canje feliz con un token vigente.
  const good = 'g'.repeat(43);
  await seedToken(deps, good);
  assert.equal((await useCase.execute(command({ token: good }))).senior.id, SENIOR_ID);
  assert.equal(deps.writer.seniors.get(SENIOR_ID)?.redeemFailedAttempts, 0);

  // Tres fallos más no disparan el bloqueo: la racha arrancó de nuevo.
  for (const suffix of ['1', '2', '3']) {
    const dead = suffix.padEnd(43, '7');
    await seedToken(deps, dead, { expiresAt: new Date(NOW.getTime() - 60_000) });
    await rejectsApp(useCase.execute(command({ token: dead })), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const profile = deps.writer.seniors.get(SENIOR_ID);
  assert.ok(profile !== undefined);
  assert.equal(profile.redeemFailedAttempts, 3);
  assert.ok(profile.redeemLockedUntil === null, 'nunca llegó al bloqueo');
});

test('S7: el bloqueo es por perfil y no afecta a otro perfil', async () => {
  const { useCase, deps } = makeUseCase();
  seedProfile(deps);
  const dead = 'dead'.padEnd(43, '0');
  await seedToken(deps, dead, { expiresAt: new Date(NOW.getTime() - 60_000) });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await rejectsApp(useCase.execute(command({ token: dead })), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  await rejectsApp(useCase.execute(command({ token: dead })), {
    statusCode: 429,
    code: 'ACCOUNT_LOCKED',
  });

  // Otro perfil, con su propio token vigente: sigue canjeando.
  seedProfile(deps, { seniorId: OTHER_SENIOR_ID });
  const other = 'o'.repeat(43);
  await seedToken(deps, other, { seniorId: OTHER_SENIOR_ID });
  const result = await useCase.execute(command({ token: other }));
  assert.equal(result.senior.id, OTHER_SENIOR_ID);
  assert.equal(result.senior.caregiverId, CAREGIVER_ID);
});

// ─── D14.2: un token ya usado no cuenta como fallo del perfil ───────────────

test('D14.2: el token ya usado repite el mismo 409 genérico y no mueve ningún contador', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'd'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  await useCase.execute(command({ token }));
  const attemptsBefore = deps.writer.seniors.get(SENIOR_ID)?.redeemFailedAttempts ?? null;

  await rejectsApp(useCase.execute(command({ token })), {
    statusCode: 409,
    code: 'CONFLICT',
    message: ALREADY_USED_MESSAGE,
  });

  const profile = deps.writer.seniors.get(SENIOR_ID);
  assert.ok(profile !== undefined);
  assert.equal(
    profile.redeemFailedAttempts,
    attemptsBefore,
    'un doble toque no acumula fallo del perfil',
  );
  assert.equal(profile.redeemLockedUntil, null);
});

test('D14.2: el perdedor del doble toque simultáneo no cuenta fallo del perfil', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 't'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);

  const settled = await Promise.allSettled([
    useCase.execute(command({ token })),
    useCase.execute(command({ token })),
  ]);
  const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'una sola reclamación gana la carrera');
  const loser = settled.find((entry) => entry.status === 'rejected');
  assert.ok(loser !== undefined && loser.status === 'rejected');
  const reason = loser.reason as { statusCode?: number; code?: string };
  assert.equal(reason.statusCode, 409);
  assert.equal(reason.code, 'CONFLICT', 'el perdedor recibe el mismo 409 genérico');

  const profile = deps.writer.seniors.get(SENIOR_ID);
  assert.ok(profile !== undefined);
  assert.equal(profile.redeemFailedAttempts, 0, 'la carrera perdida del token usado no cuenta');
  assert.equal(profile.redeemLockedUntil, null);
});

// ─── D15: un canje completado no deja al perfil sin salida ─────────────────

test('D15.2: el fallo del contador no toca la respuesta y la firma va antes del vínculo', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'p'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  deps.writer.clearRedeemFailures = async () => {
    throw new Error('la escritura del contador falló');
  };
  // El canje completado responde 201 aunque la limpieza de la racha falle.
  const result = await useCase.execute(command({ token }));
  assert.equal((jwt.verify(result.token, TEST_JWT_SECRET) as Record<string, unknown>)['role'], 'SENIOR');

  // La firma es pura y va antes del vínculo: si revienta, nada se escribe.
  deps.sessionToken.sign = () => {
    throw new Error('la firma revienta');
  };
  const fresh = 'q'.repeat(43);
  await seedToken(deps, fresh);
  await assert.rejects(useCase.execute(command({ token: fresh })), /la firma revienta/);
  assert.equal(deps.writer.consentWriteCalls, 1, 'con la firma rota no se escribió vínculo');
});

test('D15.3: el reintento dentro de la ventana recupera la respuesta sin reescribir nada', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'n'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  await useCase.execute(command({ token }));
  deps.reader.asLinked(SENIOR_ID);
  const tokenSnapshot = JSON.stringify(deps.tokens.tokens.get(hashPairingToken(token)));
  const profileSnapshot = JSON.stringify(deps.writer.seniors.get(SENIOR_ID));
  deps.advance(60); // un minuto: dentro de la ventana de 15 minutos
  const replay = await useCase.execute(command({ token }));
  const claims = jwt.verify(replay.token, TEST_JWT_SECRET) as Record<string, unknown>;
  assert.equal(claims['role'], 'SENIOR');
  assert.equal(JSON.stringify(deps.tokens.tokens.get(hashPairingToken(token))), tokenSnapshot,
    'el token queda byte-idéntico: ni un nuevo usedAt');
  assert.equal(JSON.stringify(deps.writer.seniors.get(SENIOR_ID)), profileSnapshot,
    'el perfil no cambia: ni evidencia nueva ni contador movido');
  assert.equal(deps.writer.consentWriteCalls, 1, 'el replay no vuelve a escribir el vínculo');
});

test('D15.3: fuera de la ventana vuelve el 409 de siempre; sin el perfil LINKED no hay replay', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'w'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  await useCase.execute(command({ token }));
  deps.reader.asLinked(SENIOR_ID);
  deps.advance(15 * 60 + 1); // un segundo después de la ventana
  await rejectsApp(useCase.execute(command({ token })),
    { statusCode: 409, code: 'SENIOR_ALREADY_LINKED', message: LINKED_MESSAGE });

  // Token YA usado con el perfil todavía PENDING: el replay exige LINKED.
  seedProfile(deps, { seniorId: OTHER_SENIOR_ID });
  const pending = 'v'.repeat(43);
  await seedToken(deps, pending, { seniorId: OTHER_SENIOR_ID });
  const record = deps.tokens.tokens.get(hashPairingToken(pending))!;
  deps.tokens.tokens.set(hashPairingToken(pending), { ...record, usedAt: NOW });
  await rejectsApp(useCase.execute(command({ token: pending })),
    { statusCode: 409, code: 'CONFLICT', message: ALREADY_USED_MESSAGE });
});

test('D15.3: el bloqueo por perfil también frena el replay — 429 con token recuperable', async () => {
  const { useCase, deps } = makeUseCase();
  const token = 'k'.repeat(43);
  await seedToken(deps, token);
  seedProfile(deps);
  await useCase.execute(command({ token }));
  deps.reader.asLinked(SENIOR_ID);
  // El bloqueo aparece después del canje: cinco fallos sembrados por el puerto.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await deps.writer.registerRedeemFailure(SENIOR_ID, { maxAttempts: 5, lockMs: 15 * 60_000, now: NOW });
  }
  await rejectsApp(useCase.execute(command({ token })),
    { statusCode: 429, code: 'ACCOUNT_LOCKED', details: { retryAfterSeconds: 900 } });
});

// ─── D9: throttle por IP ────────────────────────────────────────────────────

test('D9: la ventana por IP responde 429 TOO_MANY_REQUESTS y también cuenta tokens desconocidos', async () => {
  const { useCase, deps } = makeUseCase({ ipMax: 2, ipWindowSeconds: 15 * 60 });
  seedProfile(deps);

  await rejectsApp(useCase.execute(command({ token: 'k1'.padEnd(43, '1'), ipAddress: IP_A })), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
  await rejectsApp(useCase.execute(command({ token: 'k2'.padEnd(43, '2'), ipAddress: IP_A })), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
  // El tercero (también con token desconocido) cae en la ventana.
  await rejectsApp(useCase.execute(command({ token: 'k3'.padEnd(43, '3'), ipAddress: IP_A })), {
    statusCode: 429,
    code: 'TOO_MANY_REQUESTS',
    message: IP_LIMIT_MESSAGE,
    details: { retryAfterSeconds: 900 },
  });
  // Otra IP tiene su propia bolsa.
  await rejectsApp(useCase.execute(command({ token: 'k4'.padEnd(43, '4'), ipAddress: IP_B })), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
});

test('D9: el intento bloqueado no se registra y la ventana es móvil', async () => {
  const { useCase, deps } = makeUseCase({ ipMax: 2, ipWindowSeconds: 60 });
  const burn = (suffix: string) => `burn${suffix}`.padEnd(43, '0');
  await rejectsApp(useCase.execute(command({ token: burn('a'), ipAddress: IP_A })), {
    statusCode: 404,
  });
  await rejectsApp(useCase.execute(command({ token: burn('b'), ipAddress: IP_A })), {
    statusCode: 404,
  });
  await rejectsApp(useCase.execute(command({ token: burn('c'), ipAddress: IP_A })), {
    statusCode: 429,
    code: 'TOO_MANY_REQUESTS',
  });

  // La ventana vence por el reloj inyectado, sin dormir el test: los 429 no
  // extendieron nada (regla 6).
  deps.advance(61);
  await rejectsApp(useCase.execute(command({ token: burn('d'), ipAddress: IP_A })), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
});

// ─── T4: HTTP ───────────────────────────────────────────────────────────────

interface RedeemableSession {
  token: string;
  /** El id del familiar dueño: los pines de D14 siembran tokens con su caregiverId. */
  userId: string;
  seniorId: string;
  qrToken: string;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function seedCaregiver(
  harness: Harness,
  base: string,
  email: string,
): Promise<{ token: string; userId: string }> {
  const registered = await post(base, '/api/auth/register', { ...VALID_BODY, email });
  assert.equal(registered.status, 201, `cuerpo: ${registered.text}`);
  const userId = (registered.json as { user: { id: string } }).user.id;
  harness.repo.verifiedAt.set(email, FIXED_NOW);
  const logged = await post(base, '/api/auth/login', { email, password: VALID_BODY.password });
  assert.equal(logged.status, 200, `cuerpo: ${logged.text}`);
  return { token: (logged.json as { token: string }).token, userId };
}

/**
 * S11: el flujo completo por HTTP — emite el QR como el panel y devuelve la
 * sesión del familiar, el id del perfil y el token en claro del QR.
 */
async function seedRedeemable(harness: Harness, base: string, email: string): Promise<RedeemableSession> {
  const { token, userId } = await seedCaregiver(harness, base, email);
  const created = await post(base, '/api/seniors', PROFILE_BODY, auth(token));
  assert.equal(created.status, 201, `cuerpo: ${created.text}`);
  const seniorId = (created.json as { id: string }).id;
  const emitted = await post(base, `${PAIRING}/qr`, { seniorId }, auth(token));
  assert.equal(emitted.status, 201, `cuerpo: ${emitted.text}`);
  const payloads = (harness.qrEncoder as RecordingQrEncoder).payloads;
  const payload = payloads[payloads.length - 1];
  assert.ok(payload !== undefined, 'el QR no se codificó');
  const qrToken = (JSON.parse(payload) as { token: string }).token;
  // El canje del arnés lee el perfil del doble de HU-009; los pines de Mongo
  // cubren el adaptador real. Se siembra con el dueño real de la sesión.
  harness.redeemReader.seed(
    {
      id: seniorId,
      email: `senior+${seniorId.slice(-6)}@seniors.local`,
      fullName: 'Rosa Pérez',
      linkStatus: 'PENDING',
      emailVerifiedAt: FIXED_NOW,
      phone: null,
      timezone: 'America/Bogota',
      sessionVersion: null,
      createdAt: FIXED_NOW,
    },
    userId,
  );
  harness.redeemWriter.seed(seniorId, { linkStatus: 'PENDING' });
  return { token, userId, seniorId, qrToken };
}

test('S11/S13 (HTTP): el canje público responde 201 con exactamente { token, senior }', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'canje@example.com');

    const result = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });

    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as { token: string; senior: Record<string, unknown> };
    assert.deepEqual(Object.keys(body).sort(), ['senior', 'token']);
    const senior = body.senior;
    assert.deepEqual(
      Object.keys(senior).sort(),
      ['caregiverId', 'createdAt', 'email', 'emailVerified', 'fullName', 'id', 'linkStatus', 'phone', 'role', 'timezone'],
      'el objeto senior lleva exactamente los campos de S13, sin ficha médica',
    );
    assert.equal(senior['role'], 'SENIOR');
    assert.equal(senior['linkStatus'], 'LINKED');
    assert.equal(senior['timezone'], 'America/Bogota');
    assert.equal(senior['fullName'], 'Rosa Pérez');
    assert.equal(senior['id'], session.seniorId);
    assert.equal(senior['emailVerified'], true);
    assert.equal('bloodType' in senior, false);
    assert.equal('allergies' in senior, false);

    // S4: el canje devuelve una sesión de SENIOR, verificable con el secreto.
    const claims = jwt.verify(body.token, TEST_JWT_SECRET) as Record<string, unknown>;
    assert.equal(claims['sub'], session.seniorId);
    assert.equal(claims['role'], 'SENIOR');
    assert.equal(claims['sv'], 0);

    // La transición con la evidencia del servidor (D4): reloj, config e IP.
    const write = harness.redeemWriter.consentWrites[0];
    assert.ok(write !== undefined);
    assert.equal(write.acceptedTermsAt.getTime(), FIXED_NOW.getTime());
    assert.equal(write.termsVersion, TERMS_VERSION);
    assert.equal(write.ipAddress, '127.0.0.1');
  });
});

test('S18 (HTTP): si la escritura del perfil falla después del reclamo → 500 y token quemado', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'falloclose@example.com');
    harness.redeemWriter.markLinkedError = new Error('la base del canje se cayó');

    const result = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(result.status, 500, `cuerpo: ${result.text}`);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'INTERNAL_ERROR');
    assert.equal(envelope.message, 'Unexpected server error');
    assert.equal(harness.redeemWriter.consentWriteCalls, 1, 'se intentó la escritura del vínculo');

    // El doble del escritor real en memoria consume el error: a partir de acá
    // el token ya está quemado (falla cerrado) y un segundo canje no revive
    // el QR: rinde el 409 genérico.
    harness.redeemWriter.markLinkedError = null;
    const second = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(second.status, 409, `cuerpo: ${second.text}`);
    assert.equal(errorEnvelope(second.json).code, 'CONFLICT');
  });
});

test('S8 (HTTP): el segundo canje del mismo token recibe el 409 genérico con mensaje byte-exacto', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'unacv@example.com');
    const first = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(first.status, 201);

    const second = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(second.status, 409);
    const envelope = errorEnvelope(second.json);
    assert.equal(envelope.code, 'CONFLICT');
    assert.equal(envelope.message, ALREADY_USED_MESSAGE);
  });
});

test('S14 (HTTP): desconocido → 404; malformado → 400; vencido → 400; invalidado → 400', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    // Desconocido pero bien formado.
    const unknown = await post(base, REDEEM, { token: 'n'.repeat(43), acceptedTerms: true });
    assert.equal(unknown.status, 404);
    assert.equal(errorEnvelope(unknown.json).code, 'NOT_FOUND');
    assert.equal(errorEnvelope(unknown.json).message, NOT_FOUND_MESSAGE);

    // Malformado.
    const malformed = await post(base, REDEEM, { token: 'truncado', acceptedTerms: true });
    assert.equal(malformed.status, 400);
    assert.equal(errorEnvelope(malformed.json).code, 'VALIDATION_ERROR');
    assert.equal(errorEnvelope(malformed.json).message, INVALID_MESSAGE);

    // Vencido: emitido y el reloj avanza más allá del TTL.
    const session = await seedRedeemable(harness, base, 'vencido@example.com');
    harness.clock.now = new Date(FIXED_NOW.getTime() + 25 * 60 * 60_000);
    const expired = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(expired.status, 400);
    assert.equal(errorEnvelope(expired.json).message, INVALID_MESSAGE);

    // Invalidado: una segunda emisión reemplaza al primer token.
    const secondEmit = await post(
      base,
      `${PAIRING}/qr`,
      { seniorId: session.seniorId },
      auth(session.token),
    );
    assert.equal(secondEmit.status, 201, `cuerpo: ${secondEmit.text}`);
    const payloads = (harness.qrEncoder as RecordingQrEncoder).payloads;
    const newPayload = payloads[payloads.length - 1];
    assert.ok(newPayload !== undefined);
    const newToken = (JSON.parse(newPayload) as { token: string }).token;
    assert.notEqual(newToken, session.qrToken);
    const invalidated = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(invalidated.status, 400);
    assert.equal(errorEnvelope(invalidated.json).message, INVALID_MESSAGE);
    // Y el nuevo sí canjea.
    const ok = await post(base, REDEEM, { token: newToken, acceptedTerms: true });
    assert.equal(ok.status, 201, `cuerpo: ${ok.text}`);
  });
});

test('D3 (HTTP): sin acceptedTerms → 400 TERMS_NOT_ACCEPTED y nada se reclamó ni escribió', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'consentimiento@example.com');

    const missing = await post(base, REDEEM, { token: session.qrToken });
    assert.equal(missing.status, 400);
    assert.equal(errorEnvelope(missing.json).code, 'TERMS_NOT_ACCEPTED');
    const falseFlag = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: false });
    assert.equal(falseFlag.status, 400);
    assert.equal(errorEnvelope(falseFlag.json).code, 'TERMS_NOT_ACCEPTED');

    assert.equal(harness.redeemWriter.consentWriteCalls, 0);
    // El token sigue usable después del rechazo por consentimiento.
    const ok = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(ok.status, 201, `cuerpo: ${ok.text}`);
  });
});

test('S19/D3 (HTTP): los campos de más del cuerpo se ignoran — el cliente no fija la evidencia ni la ficha', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'evidencia@example.com');
    const forged = {
      token: session.qrToken,
      acceptedTerms: true,
      acceptedTermsAt: '2030-01-01T00:00:00.000Z',
      termsVersion: '9.9-cliente',
      ipAddress: '6.6.6.6',
      fullName: 'Nombre Forjado',
      phone: '+570000000000',
    };
    const result = await post(base, REDEEM, forged);
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const senior = (result.json as { senior: Record<string, unknown> }).senior;
    assert.equal(senior['fullName'], 'Rosa Pérez', 'la ficha la administra el familiar');
    const write = harness.redeemWriter.consentWrites[0];
    assert.ok(write !== undefined);
    assert.deepEqual(
      { ...write, acceptedTermsAt: write.acceptedTermsAt.toISOString() },
      {
        seniorId: session.seniorId,
        acceptedTermsAt: FIXED_NOW.toISOString(),
        termsVersion: TERMS_VERSION,
        ipAddress: '127.0.0.1',
      },
      'la evidencia la arma el servidor: reloj, TERMS_VERSION y req.ip',
    );
  });
});

test('S7 (HTTP): cinco fallos bloquean el perfil con 429 ACCOUNT_LOCKED y details.retryAfterSeconds', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const first = await seedRedeemable(harness, base, 'bloqueo@example.com');
    // El reloj avanza más allá del vencimiento: cada intento es un fallo.
    harness.clock.now = new Date(FIXED_NOW.getTime() + 25 * 60 * 60_000);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await post(base, REDEEM, { token: first.qrToken, acceptedTerms: true });
      assert.equal(failed.status, 400);
      assert.equal(errorEnvelope(failed.json).code, 'VALIDATION_ERROR');
    }
    const locked = await post(base, REDEEM, { token: first.qrToken, acceptedTerms: true });
    assert.equal(locked.status, 429, `cuerpo: ${locked.text}`);
    const envelope = errorEnvelope(locked.json);
    assert.equal(envelope.code, 'ACCOUNT_LOCKED');
    assert.equal(envelope.message, LOCKED_MESSAGE);
    assert.deepEqual(envelope.details, { retryAfterSeconds: 900 });

    // El intento bloqueado no extiende nada y otro perfil no se entera.
    const other = await seedRedeemable(harness, base, 'otro-perfil@example.com');
    const ok = await post(base, REDEEM, { token: other.qrToken, acceptedTerms: true });
    assert.equal(ok.status, 201, `cuerpo: ${ok.text}`);
  });
});

test('D9 (HTTP): el límite por IP responde 429 TOO_MANY_REQUESTS con retryAfterSeconds', async () => {
  const harness = makeHarness({
    qrEncoder: new RecordingQrEncoder(),
    app: { trustProxyHops: 1 },
    redeemIpMaxAttempts: 2,
    redeemIpWindowMinutes: 15,
  });
  await withServer(harness, async (base) => {
    const headers = { 'x-forwarded-for': IP_A };
    const first = await post(base, REDEEM, { token: 'p1'.padEnd(43, '1'), acceptedTerms: true }, headers);
    assert.equal(first.status, 404);
    const second = await post(base, REDEEM, { token: 'p2'.padEnd(43, '2'), acceptedTerms: true }, headers);
    assert.equal(second.status, 404);
    const third = await post(base, REDEEM, { token: 'p3'.padEnd(43, '3'), acceptedTerms: true }, headers);
    assert.equal(third.status, 429, `cuerpo: ${third.text}`);
    const envelope = errorEnvelope(third.json);
    assert.equal(envelope.code, 'TOO_MANY_REQUESTS');
    assert.equal(envelope.message, IP_LIMIT_MESSAGE);
    assert.equal(typeof (envelope.details as { retryAfterSeconds: number }).retryAfterSeconds, 'number');

    // Otra IP tiene su propia bolsa.
    const otherIp = await post(
      base,
      REDEEM,
      { token: 'p4'.padEnd(43, '4'), acceptedTerms: true },
      { 'x-forwarded-for': IP_B },
    );
    assert.equal(otherIp.status, 404);
  });
});

// ─── Pines de regresión de la verificación independiente (D14) ──────────────

test('pin (HTTP): el token ya usado y el token ajeno responden con el mismo cuerpo byte-idéntico', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'identico@example.com');
    const used = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(used.status, 201, `cuerpo: ${used.text}`);

    // Un token PENDIENTE cuyo caregiverId ya no tiene el vínculo del perfil:
    // ajeno → el mismo 409 genérico de un token consumido (S17), sin detalles.
    const foreign = 'fffff'.padEnd(43, 'f');
    await harness.pairingRepo.create({
      seniorId: session.seniorId,
      caregiverId: '507f1f77bcf86cd7994390cc',
      tokenHash: hashPairingToken(foreign),
      expiresAt: new Date(FIXED_NOW.getTime() + 24 * 60 * 60_000),
    });

    const asUsed = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    const asForeign = await post(base, REDEEM, { token: foreign, acceptedTerms: true });
    const usedEnvelope = errorEnvelope(asUsed.json);
    const foreignEnvelope = errorEnvelope(asForeign.json);
    assert.equal(asUsed.status, 409);
    assert.equal(asForeign.status, asUsed.status);
    assert.equal(foreignEnvelope.code, usedEnvelope.code);
    assert.equal(foreignEnvelope.code, 'CONFLICT');
    assert.equal(foreignEnvelope.message, usedEnvelope.message);
    assert.equal(foreignEnvelope.details, undefined);
    assert.equal(
      asForeign.text,
      asUsed.text,
      'la respuesta entera es byte-idéntica: el 409 no confirma ningún id',
    );
  });
});

test('pin (HTTP): cinco tokens inservibles bloquean el perfil; el vencimiento del bloqueo libera y la racha vuelve a 0', async () => {
  const harness = makeHarness({
    qrEncoder: new RecordingQrEncoder(),
    // La ventana configurada (no el default) para pinar el retryAfterSeconds.
    redeemLockoutMinutes: 2,
  });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'ventana@example.com');
    // D14.2: el ya usado no cuenta, así que el pin usa un token VENCIDO del
    // mismo perfil (inservible por vencimiento: único fallo que acumula).
    const dead = 'dead0'.padEnd(43, '0');
    await harness.pairingRepo.create({
      seniorId: session.seniorId,
      caregiverId: session.userId,
      tokenHash: hashPairingToken(dead),
      expiresAt: new Date(FIXED_NOW.getTime() - 60_000),
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await post(base, REDEEM, { token: dead, acceptedTerms: true });
      assert.equal(failed.status, 400, `intento ${attempt + 1}: ${failed.text}`);
      assert.equal(errorEnvelope(failed.json).code, 'VALIDATION_ERROR');
    }
    const locked = await post(base, REDEEM, { token: dead, acceptedTerms: true });
    assert.equal(locked.status, 429, `cuerpo: ${locked.text}`);
    const envelope = errorEnvelope(locked.json);
    assert.equal(envelope.code, 'ACCOUNT_LOCKED');
    assert.deepEqual(envelope.details, { retryAfterSeconds: 120 }, 'la ventana es la configurada');

    // Un segundo perfil no se entera del bloqueo.
    const other = await seedRedeemable(harness, base, 'ventana2@example.com');
    const okOther = await post(base, REDEEM, { token: other.qrToken, acceptedTerms: true });
    assert.equal(okOther.status, 201, `cuerpo: ${okOther.text}`);

    // El reloj pasa la ventana del bloqueo: el canje válido del primer perfil
    // ahora sí entra y deja la racha en 0.
    harness.clock.now = new Date(FIXED_NOW.getTime() + 3 * 60_000);
    const ok = await post(base, REDEEM, { token: session.qrToken, acceptedTerms: true });
    assert.equal(ok.status, 201, `cuerpo: ${ok.text}`);
    const profile = harness.redeemWriter.seniors.get(session.seniorId);
    assert.ok(profile !== undefined);
    assert.equal(profile.redeemFailedAttempts, 0, 'el canje feliz limpia la racha');
    assert.equal(profile.redeemLockedUntil, null);
  });
});

test('pin D14.1 (HTTP): emitir un QR nuevo desbloquea al instante — el QR nuevo se canjea y el re-canje no mueve el contador', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const session = await seedRedeemable(harness, base, 'escape@example.com');
    const dead = 'deade'.padEnd(43, '0');
    await harness.pairingRepo.create({
      seniorId: session.seniorId,
      caregiverId: session.userId,
      tokenHash: hashPairingToken(dead),
      expiresAt: new Date(FIXED_NOW.getTime() - 60_000),
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await post(base, REDEEM, { token: dead, acceptedTerms: true });
      assert.equal(failed.status, 400);
    }
    const locked = await post(base, REDEEM, { token: dead, acceptedTerms: true });
    assert.equal(locked.status, 429, `cuerpo: ${locked.text}`);

    // El familiar emite otro QR: la emisión limpia la racha (D14.1).
    const reemit = await post(
      base,
      `${PAIRING}/qr`,
      { seniorId: session.seniorId },
      auth(session.token),
    );
    assert.equal(reemit.status, 201, `cuerpo: ${reemit.text}`);
    const payloads = (harness.qrEncoder as RecordingQrEncoder).payloads;
    const newPayload = payloads[payloads.length - 1];
    assert.ok(newPayload !== undefined);
    const newToken = (JSON.parse(newPayload) as { token: string }).token;
    assert.notEqual(newToken, session.qrToken);

    // El QR nuevo se canjea SIN esperar la ventana del bloqueo.
    const ok = await post(base, REDEEM, { token: newToken, acceptedTerms: true });
    assert.equal(ok.status, 201, `cuerpo: ${ok.text}`);
    const profile = harness.redeemWriter.seniors.get(session.seniorId);
    assert.ok(profile !== undefined);
    assert.equal(profile.redeemFailedAttempts, 0, 'el bloqueo quedó reiniciado');
    assert.equal(profile.redeemLockedUntil, null);

    // El doble canje del mismo QR: 409 genérico, contador intacto y el perfil
    // sigue consistente (una sola escritura de consentimiento, sin bloqueo).
    const second = await post(base, REDEEM, { token: newToken, acceptedTerms: true });
    assert.equal(second.status, 409, `cuerpo: ${second.text}`);
    assert.equal(errorEnvelope(second.json).code, 'CONFLICT');
    assert.equal(
      harness.redeemWriter.seniors.get(session.seniorId)?.redeemFailedAttempts,
      0,
      'el re-canje del mismo token no acumula fallos',
    );
    assert.equal(harness.redeemWriter.consentWriteCalls, 1, 'una sola escritura de consentimiento');
    assert.equal(harness.redeemWriter.seniors.get(session.seniorId)?.linkStatus, 'LINKED');
  });
});
