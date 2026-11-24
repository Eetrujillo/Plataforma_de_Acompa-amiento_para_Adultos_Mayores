/**
 * HU-008 / T4-T5 — emisión del QR de vinculación, por casos de uso y por HTTP.
 * Aplicación: el orden de S17 (validar → token → QR → invalidar → persistir)
 * y los cuatro errores de S12. HTTP: contrato de docs/pairing-api.md (S9-S12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../src/config/env.ts';

import {
  FIXED_NOW,
  TEST_JWT_SECRET,
  VALID_BODY,
  errorEnvelope,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';
import type { Harness } from './support/registerHarness.ts';
import { GeneratePairingQr } from '../src/modules/pairing/application/GeneratePairingQr.ts';
import {
  PAIRING_QR_UNAVAILABLE_MESSAGE,
  SENIOR_ALREADY_LINKED_MESSAGE,
  SENIOR_ID_REQUIRED_MESSAGE,
} from '../src/modules/pairing/application/GeneratePairingQr.ts';
import { hashPairingToken } from '../src/modules/pairing/domain/pairingToken.ts';
import {
  FailingQrEncoder,
  InMemoryPairingTokenRepository,
  RecordingQrEncoder,
  StaticSeniorReader,
} from './support/pairingFakes.ts';

const PAIRING = '/api/pairing';
const NOW = FIXED_NOW;

const SENIOR_ID = '507f1f77bcf86cd799439011';
const FOREIGN_ID = '507f1f77bcf86cd799439022';
const CAREGIVER_ID = '507f1f77bcf86cd7994390aa';
const STRANGER_ID = '507f1f77bcf86cd7994390bb';

interface Deps {
  reader: StaticSeniorReader;
  tokens: InMemoryPairingTokenRepository;
  encoder: RecordingQrEncoder | FailingQrEncoder;
  clock: () => Date;
  ttlMinutes: number;
}

function makeUseCase(overrides: Partial<Deps> = {}): {
  useCase: GeneratePairingQr;
  deps: Deps;
} {
  const reader = overrides.reader ?? new StaticSeniorReader();
  const tokens = overrides.tokens ?? new InMemoryPairingTokenRepository();
  const encoder = overrides.encoder ?? new RecordingQrEncoder();
  const clock = overrides.clock ?? (() => new Date(NOW.getTime()));
  const useCase = new GeneratePairingQr({
    seniorReader: reader,
    pairingTokenRepository: tokens,
    qrEncoder: encoder,
    clock,
    ttlMinutes: overrides.ttlMinutes ?? 1440,
  });
  return { useCase, deps: { reader, tokens, encoder, clock, ttlMinutes: overrides.ttlMinutes ?? 1440 } };
}

function seedPendingProfile(reader: StaticSeniorReader, caregiverId = CAREGIVER_ID): void {
  reader.seed(
    {
      id: SENIOR_ID,
      fullName: 'Rosa Pérez',
      linkStatus: 'PENDING',
      createdAt: NOW,
    },
    caregiverId,
  );
}

/** Sacar el token en claro que el caso de uso le entregó al codificador. */
function encodedToken(deps: Deps): string {
  assert.ok(deps.encoder instanceof RecordingQrEncoder, 'el codificador debe grabar el payload');
  const payload = deps.encoder.payloads[deps.encoder.payloads.length - 1];
  assert.ok(payload !== undefined, 'el codificador no recibió ningún payload');
  const parsed = JSON.parse(payload) as { type: string; token: string };
  assert.equal(parsed.type, 'senior-pairing');
  return parsed.token;
}

// ─── T4: aplicación ──────────────────────────────────────────────────────────

test('S17/S5: el caso de uso devuelve seniorId, expiresAt y qrCodeDataUrl; a la base sólo llega el hash', async () => {
  const { useCase, deps } = makeUseCase();
  seedPendingProfile(deps.reader);

  const result = await useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });

  // El resultado no lleva la credencial: la única copia en claro está en el QR.
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'qrCodeDataUrl', 'seniorId']);
  assert.equal('token' in result, false, 'el resultado jamás expone el token');
  assert.equal(result.seniorId, SENIOR_ID);
  assert.match(result.qrCodeDataUrl, /^data:image\/png;base64,/);

  const token = encodedToken(deps);
  assert.equal(deps.tokens.createCalls, 1);
  const write = deps.tokens.createdWrites[0];
  assert.ok(write !== undefined);
  assert.deepEqual(
    Object.keys(write).sort(),
    ['caregiverId', 'expiresAt', 'seniorId', 'tokenHash'],
    'la persistencia recibe el hash, no el token',
  );
  assert.equal(write.tokenHash, hashPairingToken(token));
  // Nada de lo recibido por la persistencia contiene el token en claro.
  for (const value of Object.values(write)) {
    if (typeof value === 'string') assert.notEqual(value, token);
  }
});

test('S14: el TTL configurado reemplaza al default y el vencimiento sale del reloj inyectado', async () => {
  const { useCase, deps } = makeUseCase({ ttlMinutes: 90 });
  seedPendingProfile(deps.reader);

  const result = await useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID });

  assert.equal(result.expiresAt.getTime(), NOW.getTime() + 90 * 60_000);
});

test('S3: un perfil ya vinculado responde 409, no persiste nada y deja el token anterior vivo', async () => {
  const { useCase, deps } = makeUseCase();
  seedPendingProfile(deps.reader);
  deps.reader.asLinked(SENIOR_ID);
  // Un QR no usado vigente de una emisión anterior: el 409 no lo toca.
  await deps.tokens.create({
    seniorId: SENIOR_ID,
    caregiverId: CAREGIVER_ID,
    tokenHash: hashPairingToken('a'.repeat(43)),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
  const createCallsBefore = deps.tokens.createCalls; // el alto del QR anterior

  await assert.rejects(
    useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      const appError = error as { statusCode?: number; code?: string; message?: string };
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.code, 'SENIOR_ALREADY_LINKED');
      assert.equal(appError.message, SENIOR_ALREADY_LINKED_MESSAGE);
      return true;
    },
  );
  assert.equal(deps.tokens.createCalls, createCallsBefore, 'el caso de uso no crea ningún token nuevo');
  assert.equal(deps.tokens.invalidations.length, 0, 'no se invalida el QR anterior');
  const previous = [...deps.tokens.tokens.values()][0];
  assert.ok(previous !== undefined);
  assert.equal(previous.invalidatedAt, null);
});

test('S8: un perfil sin `linkStatus` (anterior a HU-005) cuenta como vinculado: 409 (S18)', async () => {
  const { useCase, deps } = makeUseCase();
  seedPendingProfile(deps.reader);
  const record = deps.reader.profiles.get(SENIOR_ID);
  assert.ok(record !== undefined);
  deps.reader.profiles.set(SENIOR_ID, { ...record, linkStatus: null });

  await assert.rejects(
    useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID }),
    (error: unknown) => {
      const appError = error as { statusCode?: number; code?: string };
      assert.equal(appError.statusCode, 409);
      assert.equal(appError.code, 'SENIOR_ALREADY_LINKED');
      return true;
    },
  );
  assert.equal(deps.tokens.createCalls, 0);
});

test('S8: falta `seniorId` o no son 24 hex: 400 SENIOR_ID_REQUIRED sin tocar la base', async () => {
  const { useCase, deps } = makeUseCase();

  for (const seniorId of ['', 'no-es-un-id', `${SENIOR_ID}x`]) {
    await assert.rejects(
      useCase.execute({ seniorId, caregiverId: CAREGIVER_ID }),
      (error: unknown) => {
        const appError = error as { statusCode?: number; code?: string; message?: string };
        assert.equal(appError.statusCode, 400);
        assert.equal(appError.code, 'SENIOR_ID_REQUIRED');
        assert.equal(appError.message, SENIOR_ID_REQUIRED_MESSAGE);
        return true;
      },
      `con seniorId="${seniorId}"`,
    );
  }
  assert.equal(deps.tokens.createCalls, 0);
  assert.equal(deps.tokens.invalidations.length, 0);
});

test('S8: perfil ajeno, inexistente o cuenta CAREGIVER: el mismo 404 SENIOR_NOT_FOUND', async () => {
  const { useCase, deps } = makeUseCase();
  seedPendingProfile(deps.reader);

  const casos: { seniorId: string; caregiverId: string; cual: string }[] = [
    { seniorId: FOREIGN_ID, caregiverId: CAREGIVER_ID, cual: 'inexistente' },
    { seniorId: SENIOR_ID, caregiverId: STRANGER_ID, cual: 'de otro familiar' },
  ];
  for (const caso of casos) {
    await assert.rejects(
      useCase.execute(caso),
      (error: unknown) => {
        const appError = error as { statusCode?: number; code?: string; message?: string; details?: unknown };
        assert.equal(appError.statusCode, 404, `caso ${caso.cual}`);
        assert.equal(appError.code, 'SENIOR_NOT_FOUND');
        assert.equal(appError.message, 'No encontramos ese perfil');
        assert.equal(appError.details, undefined, 'el 404 no delata cuál de los casos fue');
        return true;
      },
      `caso ${caso.cual}`,
    );
  }
  assert.equal(deps.tokens.createCalls, 0);
  assert.equal(deps.tokens.invalidations.length, 0);
});

test('S4/S13: si el codificador falla, 503 PAIRING_QR_UNAVAILABLE sin invalidar el QR anterior', async () => {
  const { useCase, deps } = makeUseCase({
    encoder: new FailingQrEncoder(),
  });
  seedPendingProfile(deps.reader);
  await deps.tokens.create({
    seniorId: SENIOR_ID,
    caregiverId: CAREGIVER_ID,
    tokenHash: hashPairingToken('b'.repeat(43)),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
  const createCallsBefore = deps.tokens.createCalls; // el alto del QR anterior

  await assert.rejects(
    useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID }),
    (error: unknown) => {
      const appError = error as { statusCode?: number; code?: string; message?: string };
      assert.equal(appError.statusCode, 503);
      assert.equal(appError.code, 'PAIRING_QR_UNAVAILABLE');
      assert.equal(appError.message, PAIRING_QR_UNAVAILABLE_MESSAGE);
      return true;
    },
  );
  assert.equal(deps.tokens.invalidations.length, 0, 'la emisión no tocó la base');
  assert.equal(deps.tokens.createCalls, createCallsBefore, 'el caso de uso no crea ningún token nuevo');
  const previous = [...deps.tokens.tokens.values()][0];
  assert.ok(previous !== undefined);
  assert.equal(previous.invalidatedAt, null, 'el QR anterior sigue vigente');
});

test('S15: si la escritura del token nuevo falla, el anterior YA quedó inválido (falla cerrado)', async () => {
  const { useCase, deps } = makeUseCase();
  seedPendingProfile(deps.reader);
  await deps.tokens.create({
    seniorId: SENIOR_ID,
    caregiverId: CAREGIVER_ID,
    tokenHash: hashPairingToken('c'.repeat(43)),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
  });
  deps.tokens.createError = new Error('la base se cayó');

  await assert.rejects(
    useCase.execute({ seniorId: SENIOR_ID, caregiverId: CAREGIVER_ID }),
    /la base se cayó/,
  );
  assert.equal(deps.tokens.invalidations.length, 1, 'primero se invalida (S17)');
  const previous = [...deps.tokens.tokens.values()][0];
  assert.ok(previous !== undefined);
  assert.ok(
    previous.invalidatedAt !== null,
    'nadie queda con el QR viejo vivo: la emisión fallida lo quemó',
  );
});

// ─── T5: HTTP ────────────────────────────────────────────────────────────────

const PROFILE_BODY = {
  fullName: 'Rosa Pérez',
  timezone: 'America/Bogota',
  bloodType: 'O+',
  allergies: ['penicilina'],
  conditions: ['hipertensión'],
  medications: ['losartán'],
  emergencyContact: { fullName: 'Ana Pérez', phone: '+573001234567' },
};

interface CaregiverSession {
  token: string;
  userId: string;
  email: string;
}

/** Registro + login por HTTP real: la misma sesión del panel. */
async function seedCaregiver(
  harness: Harness,
  base: string,
  email: string,
): Promise<CaregiverSession> {
  const registered = await post(base, '/api/auth/register', { ...VALID_BODY, email });
  assert.equal(registered.status, 201, `cuerpo: ${registered.text}`);
  const userId = (registered.json as { user: { id: string } }).user.id;
  harness.repo.verifiedAt.set(email, FIXED_NOW);
  const logged = await post(base, '/api/auth/login', { email, password: VALID_BODY.password });
  assert.equal(logged.status, 200, `cuerpo: ${logged.text}`);
  const token = (logged.json as { token: string }).token;
  return { token, userId, email };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

/** Da de alta un perfil por HTTP y devuelve su `id`. */
async function seedSenior(
  base: string,
  token: string,
): Promise<string> {
  const result = await post(base, '/api/seniors', PROFILE_BODY, auth(token));
  assert.equal(result.status, 201, `cuerpo: ${result.text}`);
  return (result.json as { id: string }).id;
}

test('S9/S11: 201 exactamente { expiresAt, seniorId, qrCodeDataUrl }, PNG data URL y sin token', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'laqr@example.com');
    const seniorId = await seedSenior(base, caregiver.token);

    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));

    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'qrCodeDataUrl', 'seniorId']);
    assert.equal(body['seniorId'], seniorId);
    assert.equal(
      typeof body['qrCodeDataUrl'] === 'string' &&
        (body['qrCodeDataUrl'] as string).startsWith('data:image/png;base64,'),
      true,
      `el QR es un PNG en data URL, llegó: ${String(body['qrCodeDataUrl']).slice(0, 40)}`,
    );
    assert.equal(body['expiresAt'], new Date(NOW.getTime() + 1440 * 60_000).toISOString());
    assert.equal('token' in body, false);
  });
});

test('S21/D10: la respuesta de emisión llega con Cache-Control: no-store', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'nocache@example.com');
    const seniorId = await seedSenior(base, caregiver.token);
    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(result.status, 201);
    assert.equal(
      result.headers.get('cache-control'),
      'no-store',
      `headers: ${[...result.headers].map(([k]) => k).join(',')}`,
    );
  });
});

test('S6: el token en claro no aparece en ningún cuerpo de respuesta', async () => {
  const harness = makeHarness({ qrEncoder: new RecordingQrEncoder() });
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'notoken@example.com');
    const seniorId = await seedSenior(base, caregiver.token);

    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(result.status, 201);
    // El payload lo grabó el doble del codificador: ahí viaja el token en claro.
    const payloads = (harness.qrEncoder as RecordingQrEncoder).payloads;
    assert.equal(payloads.length, 1);
    const token = (JSON.parse(payloads[0] ?? '{}') as { token: string }).token;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(
      result.text.includes(token),
      false,
      'la respuesta HTTP jamás reproduce el token en claro',
    );
  });
});

test('S10: sin sesión 401; con sesión de rol SENIOR 403', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const sinToken = await post(base, `${PAIRING}/qr`, { seniorId: SENIOR_ID });
    assert.equal(sinToken.status, 401, `cuerpo: ${sinToken.text}`);
    assert.equal(errorEnvelope(sinToken.json).code, 'UNAUTHORIZED');

    harness.repo.users.set('senior@example.com', {
      id: 'senior-0000000000000001',
      email: 'senior@example.com',
      fullName: 'Rosa Pérez',
      role: 'SENIOR',
    });
    const seniorToken = jwt.sign(
      { sub: 'senior-0000000000000001', email: 'senior@example.com', role: 'SENIOR', sv: 0 },
      TEST_JWT_SECRET,
    );
    const rolIncorrecto = await post(
      base,
      `${PAIRING}/qr`,
      { seniorId: SENIOR_ID },
      auth(seniorToken),
    );
    assert.equal(rolIncorrecto.status, 403, `cuerpo: ${rolIncorrecto.text}`);
    assert.equal(errorEnvelope(rolIncorrecto.json).code, 'FORBIDDEN');
  });
});

test('S8 (HTTP): falta seniorId o no son 24 hex → 400 SENIOR_ID_REQUIRED', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'shortid@example.com');

    const sinId = await post(base, `${PAIRING}/qr`, {}, auth(caregiver.token));
    assert.equal(sinId.status, 400, `cuerpo: ${sinId.text}`);
    assert.equal(errorEnvelope(sinId.json).code, 'SENIOR_ID_REQUIRED');

    const malformado = await post(
      base,
      `${PAIRING}/qr`,
      { seniorId: 'no-es-un-id' },
      auth(caregiver.token),
    );
    assert.equal(malformado.status, 400, `cuerpo: ${malformado.text}`);
    assert.equal(errorEnvelope(malformado.json).code, 'SENIOR_ID_REQUIRED');
  });
});

test('S8 (HTTP): ajeno e inexistente → 404 SENIOR_NOT_FOUND con el mensaje de seniors', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const primera = await seedCaregiver(harness, base, 'primeraqr@example.com');
    const segunda = await seedCaregiver(harness, base, 'segundaqr@example.com');
    const ajeno = await seedSenior(base, primera.token);
    const inexistente = '507f1f77bcf86cd7994390ff';

    for (const seniorId of [ajeno, inexistente]) {
      const result = await post(
        base,
        `${PAIRING}/qr`,
        { seniorId },
        auth(segunda.token),
      );
      assert.equal(result.status, 404, `cuerpo (${seniorId}): ${result.text}`);
      const envelope = errorEnvelope(result.json);
      assert.equal(envelope.code, 'SENIOR_NOT_FOUND');
      assert.equal(envelope.message, 'No encontramos ese perfil');
      assert.equal(envelope.details, undefined);
    }
  });
});

test('S3 (HTTP): perfil vinculado → 409 SENIOR_ALREADY_LINKED', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'ya-vinculada@example.com');
    const seniorId = await seedSenior(base, caregiver.token);
    const record = harness.seniorRepo.profiles.get(seniorId);
    assert.ok(record !== undefined);
    Object.assign(record, { linkStatus: 'LINKED' });

    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(result.status, 409, `cuerpo: ${result.text}`);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'SENIOR_ALREADY_LINKED');
    assert.equal(envelope.message, SENIOR_ALREADY_LINKED_MESSAGE);
    assert.equal(harness.pairingRepo.createCalls, 0);
  });
});

test('S4 (HTTP): codificador caído → 503 PAIRING_QR_UNAVAILABLE', async () => {
  const harness = makeHarness({ qrEncoder: new FailingQrEncoder() });
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'qr-roto@example.com');
    const seniorId = await seedSenior(base, caregiver.token);

    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(result.status, 503, `cuerpo: ${result.text}`);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'PAIRING_QR_UNAVAILABLE');
    assert.equal(envelope.message, PAIRING_QR_UNAVAILABLE_MESSAGE);
    assert.equal(harness.pairingRepo.invalidations.length, 0);
  });
});

test('S7/S22 (HTTP): emitir de nuevo invalida el QR anterior y deja sólo uno activo', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'regenera@example.com');
    const seniorId = await seedSenior(base, caregiver.token);

    const primera = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(primera.status, 201, `cuerpo: ${primera.text}`);
    const segunda = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(segunda.status, 201, `cuerpo: ${segunda.text}`);

    const stored = [...harness.pairingRepo.tokens.values()];
    assert.equal(stored.length, 2);
    const invalidados = stored.filter((tokenRecord) => tokenRecord.invalidatedAt !== null);
    const activos = stored.filter(
      (tokenRecord) => tokenRecord.invalidatedAt === null && tokenRecord.usedAt === null,
    );
    assert.equal(invalidados.length, 1, 'sólo el primero quedó invalidado');
    assert.equal(activos.length, 1, 'sólo un QR activo por perfil');
    assert.equal(invalidados[0]?.seniorId, seniorId);
    assert.equal(activos[0]?.seniorId, seniorId);
  });
});

test('S14 (HTTP): PAIRING_TTL_MINUTES configurado gobierna expiresAt', async () => {
  const harness = makeHarness({ pairingTtlMinutes: 120 });
  await withServer(harness, async (base) => {
    const caregiver = await seedCaregiver(harness, base, 'ttl@example.com');
    const seniorId = await seedSenior(base, caregiver.token);

    const result = await post(base, `${PAIRING}/qr`, { seniorId }, auth(caregiver.token));
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    assert.equal(
      (result.json as { expiresAt: string }).expiresAt,
      new Date(NOW.getTime() + 120 * 60_000).toISOString(),
    );
  });
});

test('D7 (env): PAIRING_TTL_MINUTES default 1440, respeta enteros positivos y cae al default si no', () => {
  assert.equal(loadEnv({}).pairingTtlMinutes, 1440);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: '90' }).pairingTtlMinutes, 90);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: 'no-es-numero' }).pairingTtlMinutes, 1440);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: '0' }).pairingTtlMinutes, 1440);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: '-5' }).pairingTtlMinutes, 1440);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: '+90' }).pairingTtlMinutes, 1440);
  assert.equal(loadEnv({ PAIRING_TTL_MINUTES: '' }).pairingTtlMinutes, 1440);
});
