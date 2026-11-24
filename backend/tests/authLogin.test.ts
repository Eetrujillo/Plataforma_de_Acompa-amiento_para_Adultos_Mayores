import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { loadEnv } from '../src/config/env.ts';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/BcryptPasswordHasher.ts';
import {
  FIXED_NOW,
  IP_A,
  IP_B,
  TERMS_VERSION,
  TEST_JWT_SECRET,
  VALID_BODY,
  InMemoryUserRepository,
  errorEnvelope,
  get,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';
import type { Harness } from './support/registerHarness.ts';

const LOGIN = '/api/auth/login';
const ME = '/api/auth/me';

const LOCKED_BODY = {
  error: {
    code: 'ACCOUNT_LOCKED',
    message:
      'Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.',
    details: { retryAfterSeconds: 900 },
  },
};

/**
 * Registra (HTTP real, hasher bcrypt) y confirma el correo: la cuenta queda
 * lista para loguear. Los tests necesitan un hash real porque `BcryptPasswordHasher`
 * y `JwtTokenService` corren de verdad — son deterministas y no red.
 */
async function verifiedUser(
  harness: Harness,
  base: string,
  overrides: { email?: string; password?: string } = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = overrides.email ?? VALID_BODY.email;
  const password = overrides.password ?? VALID_BODY.password;
  const registered = await post(base, '/api/auth/register', {
    ...VALID_BODY,
    email,
    password,
  });
  assert.equal(registered.status, 201, `cuerpo: ${registered.text}`);
  const userId = (registered.json as { user: { id: string } }).user.id;
  harness.repo.verifiedAt.set(email, FIXED_NOW);
  return { userId, email, password };
}

async function login(
  base: string,
  email: string,
  password: string,
  headers: Record<string, string> = {},
) {
  return post(base, LOGIN, { email, password }, headers);
}

function me(base: string, token: string | null, headers: Record<string, string> = {}) {
  return get(base, ME, token === null ? headers : { authorization: `Bearer ${token}`, ...headers });
}

test('S1: credenciales correctas responden 200 con el token de sesión y el usuario', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const result = await login(base, fixture.email, fixture.password);
    assert.equal(result.status, 200, `cuerpo: ${result.text}`);
    const body = result.json as { token: unknown; user: Record<string, unknown> };
    assert.equal(typeof body.token, 'string');
    assert.ok((body.token as string).length > 0);
    assert.deepEqual(Object.keys(body.user).sort(), ['email', 'fullName', 'id', 'role']);
    assert.equal(body.user['id'], fixture.userId);
    assert.equal(body.user['email'], 'cuidador@example.com');
    assert.equal(body.user['role'], 'CAREGIVER');
    // El token sirve de verdad en la ruta privada de ejemplo.
    const session = await me(base, String(body.token));
    assert.equal(session.status, 200, `cuerpo: ${session.text}`);
    const meBody = session.json as { user: Record<string, unknown> };
    assert.deepEqual(Object.keys(meBody.user).sort(), ['email', 'fullName', 'id', 'role']);
    assert.equal(meBody.user['id'], fixture.userId);
  });
});

test('S2: correo inexistente y contraseña incorrecta responden el mismo 401, byte a byte', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    await verifiedUser(harness, base);
    const unknownEmail = await login(base, 'fantasma@example.com', VALID_BODY.password);
    const wrongPassword = await login(base, VALID_BODY.email, 'otraClave99');
    assert.equal(unknownEmail.status, 401, `cuerpo: ${unknownEmail.text}`);
    assert.equal(wrongPassword.status, 401, `cuerpo: ${wrongPassword.text}`);
    // idénticos byte a byte: ni el campo ni el código ni details delatan cuál falló.
    assert.equal(unknownEmail.text, wrongPassword.text);
    const envelopeUnknown = errorEnvelope(unknownEmail.json);
    const envelopeWrong = errorEnvelope(wrongPassword.json);
    assert.equal(envelopeUnknown.code, 'UNAUTHORIZED');
    assert.equal(envelopeUnknown.message, 'Credenciales inválidas');
    assert.equal(envelopeWrong.code, envelopeUnknown.code);
    assert.equal(envelopeWrong.message, envelopeUnknown.message);
    assert.equal(envelopeUnknown.details, undefined);
    assert.equal(envelopeWrong.details, undefined);
    // El falso 401 de la cuenta real sí registró el fallo (única escritura);
    // el correo sin cuenta no escribió nada (D1) ni tiene estado propio.
    assert.equal(harness.repo.failedLoginWrites, 1);
    assert.deepEqual(harness.repo.loginStateOf('fantasma@example.com'), {
      failedLoginAttempts: null,
      lockedUntil: null,
      sessionVersion: null,
    });
    assert.equal(harness.repo.loginStateOf(VALID_BODY.email).failedLoginAttempts, 1);
  });
});

test('S3: a los 4 fallos sigue 401, el 5.º responde 429 y el bloqueo vence por reloj', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await login(base, fixture.email, 'malaClave99');
      assert.equal(result.status, 401, `intento ${attempt}: ${result.text}`);
    }
    const fifth = await login(base, fixture.email, 'malaClave99');
    assert.equal(fifth.status, 429, `cuerpo: ${fifth.text}`);
    assert.equal(errorEnvelope(fifth.json).code, 'ACCOUNT_LOCKED');
    // El bloqueo quedó persistido.
    const stored = harness.repo.loginStateOf(fixture.email);
    assert.equal(stored.failedLoginAttempts, 5);
    assert.equal(stored.lockedUntil?.toISOString(), new Date(FIXED_NOW.getTime() + 15 * 60_000).toISOString());
    // Vence por reloj del servidor: 15 minutos + 1 segundo después vuelve a loguear.
    harness.clock.now = new Date(FIXED_NOW.getTime() + 15 * 60_000 + 1000);
    const after = await login(base, fixture.email, fixture.password);
    assert.equal(after.status, 200, `cuerpo: ${after.text}`);
  });
});

test('S4: el bloqueo se persiste en el usuario — un proceso nuevo con el mismo reloj no desbloquea', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await login(base, fixture.email, 'malaClave99');
      assert.ok([401, 429].includes(result.status), `intento ${attempt}: ${result.text}`);
    }
    assert.equal(harness.repo.loginStateOf(fixture.email).lockedUntil?.getTime(), FIXED_NOW.getTime() + 15 * 60_000);
  });
  // Reinicio: la misma persistencia, un proceso nuevo, el mismo reloj.
  const restarted = makeHarness({
    hasher: new BcryptPasswordHasher(),
    repository: harness.repo,
  });
  await withServer(restarted, async (base) => {
    const result = await login(base, VALID_BODY.email, VALID_BODY.password);
    assert.equal(result.status, 429, `cuerpo: ${result.text}`);
    assert.equal(errorEnvelope(result.json).code, 'ACCOUNT_LOCKED');
  });
});

test('S5: un login correcto limpia el contador (failedLoginAttempts 0, lockedUntil null)', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const failed = await login(base, fixture.email, 'malaClave99');
    assert.equal(failed.status, 401);
    assert.equal(harness.repo.loginStateOf(fixture.email).failedLoginAttempts, 1);
    const ok = await login(base, fixture.email, fixture.password);
    assert.equal(ok.status, 200, `cuerpo: ${ok.text}`);
    const stored = harness.repo.loginStateOf(fixture.email);
    assert.equal(stored.failedLoginAttempts, 0);
    assert.equal(stored.lockedUntil, null);
    assert.equal(harness.repo.clearedLoginStreaks, 1);
  });
});

test('S6: el token lleva exactamente sub, role, email y sv (+ iat/exp de la librería)', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const result = await login(base, fixture.email, fixture.password);
    assert.equal(result.status, 200, `cuerpo: ${result.text}`);
    const token = (result.json as { token: string }).token;
    const decoded: unknown = jwt.decode(token);
    assert.ok(decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded));
    const claims = decoded as Record<string, unknown>;
    assert.deepEqual(Object.keys(claims).sort(), ['email', 'exp', 'iat', 'role', 'sub', 'sv']);
    assert.equal(claims['sub'], fixture.userId);
    assert.equal(claims['email'], 'cuidador@example.com');
    assert.equal(claims['role'], 'CAREGIVER');
    assert.equal(claims['sv'], 0, 'sessionVersion null se lee como 0');
    assert.equal((claims['exp'] as number) - (claims['iat'] as number), 7 * 24 * 3600, 'vigencia 7d');
  });
});

test('S7: subir sessionVersion cierra todas las sesiones — el token con sv viejo responde 401', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const first = await login(base, fixture.email, fixture.password);
    assert.equal(first.status, 200);
    const oldToken = (first.json as { token: string }).token;
    assert.equal((await me(base, oldToken)).status, 200);

    // "Reset de contraseña" (HU-004): sube la versión de sesión.
    harness.repo.setSessionVersion(fixture.email, 1);
    const rejected = await me(base, oldToken);
    assert.equal(rejected.status, 401, `cuerpo: ${rejected.text}`);
    assert.equal(errorEnvelope(rejected.json).code, 'UNAUTHORIZED');
    assert.equal(errorEnvelope(rejected.json).message, 'La sesión no es válida');

    // Un token firmado con la versión nueva vuelve a servir.
    const second = await login(base, fixture.email, fixture.password);
    assert.equal(second.status, 200);
    const newToken = (second.json as { token: string }).token;
    assert.notEqual(oldToken, newToken);
    assert.equal((await me(base, newToken)).status, 200);
    // Y el claim sv del token nuevo es la versión subida.
    const claims = jwt.decode(newToken) as Record<string, unknown> | null;
    assert.equal(claims?.['sv'], 1);
  });
});

test('S8: la racha es por correo normalizado y un correo sin cuenta nunca se bloquea (D1)', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    await verifiedUser(harness, base, { email: 'Ana@X.com' });
    // Cuatro fallos acreditados como Ana@X.com.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await login(base, 'Ana@X.com', 'malaClave99');
      assert.equal(result.status, 401, `intento ${attempt}: ${result.text}`);
    }
    // El 5.º fallo, con ana@x.com, comparte racha: 429, no 401.
    const fifth = await login(base, 'ana@x.com', 'malaClave99');
    assert.equal(fifth.status, 429, `cuerpo: ${fifth.text}`);
    assert.equal(errorEnvelope(fifth.json).code, 'ACCOUNT_LOCKED');
    // La racha vive en la cuenta real, cuyo correo quedó normalizado.
    assert.equal(harness.repo.loginStateOf('ana@x.com').failedLoginAttempts, 5);
    assert.equal(harness.repo.lockoutStates.size, 1);
  });
});

test('S8/D1: un correo sin cuenta acumula respuestas 401 y jamás llega al 429 ni escribe estado', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    await verifiedUser(harness, base, { email: 'real@example.com' });
    // Un límite más bajo haría visible cualquier conteo de correos sin cuenta.
    for (const ghost of ['fantasma@example.com', 'Fantasma@Example.com']) {
      for (let attempt = 1; attempt <= 7; attempt += 1) {
        const result = await login(base, ghost, VALID_BODY.password);
        assert.equal(result.status, 401, `${ghost} intento ${attempt}: ${result.text}`);
      }
    }
    assert.equal(harness.repo.failedLoginWrites, 0, 'ninguna escritura de bloqueo para correos sin cuenta');
    assert.equal(harness.repo.lockoutStates.size, 1, 'sólo la cuenta real tiene estado de login');
    assert.equal(harness.repo.users.size, 1);
  });
});

test('S9: pasados LOGIN_IP_MAX_ATTEMPTS fallos desde una IP, la respuesta es 429 TOO_MANY_REQUESTS y no toca la base', async () => {
  const harness = makeHarness({
    hasher: new BcryptPasswordHasher(),
    loginIpMaxAttempts: 2,
    app: { trustProxyHops: 1 },
  });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const blockedIdea = { 'x-forwarded-for': IP_A };
    // Dos fallos desde la IP A consumen la ventana.
    const first = await login(base, fixture.email, 'malaClave99', blockedIdea);
    const second = await login(base, 'fantasma@example.com', 'malaClave99', blockedIdea);
    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    const readsBeforeThird = harness.repo.findCredentialsCalls;
    // El tercero —aunque la contraseña sea correcta y esté la cuenta real— es 429 por IP.
    const third = await login(base, fixture.email, fixture.password, blockedIdea);
    assert.equal(third.status, 429, `cuerpo: ${third.text}`);
    const envelope = errorEnvelope(third.json);
    assert.equal(envelope.code, 'TOO_MANY_REQUESTS', 'código distinto del bloqueo de cuenta (D2)');
    assert.ok(
      typeof envelope.details === 'object' &&
        envelope.details !== null &&
        'retryAfterSeconds' in (envelope.details as Record<string, unknown>),
      `details: ${JSON.stringify(envelope.details)}`,
    );
    // D3: el 429 por IP se evaluó antes de tocar la base.
    assert.equal(harness.repo.findCredentialsCalls, readsBeforeThird);
    // La misma IP frente a un correo inventado también recibe el 429: no es oráculo.
    const ghost = await login(base, 'otroFantasma@example.com', 'malaClave99', blockedIdea);
    assert.equal(ghost.status, 429);
  });
});

test('S9: el límite por IP no puede usar el correo para bloquear a otra persona desde otra IP', async () => {
  const harness = makeHarness({
    hasher: new BcryptPasswordHasher(),
    loginIpMaxAttempts: 2,
    app: { trustProxyHops: 1 },
  });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const fromA = { 'x-forwarded-for': IP_A };
    await login(base, fixture.email, 'malaClave99', fromA);
    await login(base, fixture.email, 'malaClave99', fromA);
    // Desde la IP A ya no entra (ni con la contraseña correcta).
    const exhausted = await login(base, fixture.email, fixture.password, fromA);
    assert.equal(exhausted.status, 429);
    assert.equal(errorEnvelope(exhausted.json).code, 'TOO_MANY_REQUESTS');
    // Desde otra IP, la misma cuenta sigue pudiendo loguear: el límite es por IP.
    const fromB = await login(base, fixture.email, fixture.password, { 'x-forwarded-for': IP_B });
    assert.equal(fromB.status, 200, `cuerpo: ${fromB.text}`);
  });
});

test('S10: sin token, malformado, con secreto ajeno o vencido, /me responde 401 sin ejecutar nada', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const session = await login(base, fixture.email, fixture.password);
    assert.equal(session.status, 200);
    const token = (session.json as { token: string }).token;

    const withoutHeader = await me(base, null);
    assert.equal(withoutHeader.status, 401);
    assert.equal(errorEnvelope(withoutHeader.json).message, 'Falta el token de sesión');

    const malformed = await me(base, 'esto-no-es-un-jwt');
    assert.equal(malformed.status, 401);
    assert.equal(errorEnvelope(malformed.json).message, 'La sesión no es válida');

    const forged = jwt.sign({ email: fixture.email, role: 'CAREGIVER', sv: 0 }, 'otro-secreto', {
      subject: fixture.userId,
      expiresIn: '7d',
    });
    const wrongSecret = await me(base, forged);
    assert.equal(wrongSecret.status, 401);
    assert.equal(errorEnvelope(wrongSecret.json).message, 'La sesión no es válida');

    const expired = jwt.sign(
      { email: fixture.email, role: 'CAREGIVER', sv: 0 },
      TEST_JWT_SECRET,
      { subject: fixture.userId, expiresIn: -1 },
    );
    const expiredResult = await me(base, expired);
    assert.equal(expiredResult.status, 401);
    assert.equal(errorEnvelope(expiredResult.json).message, 'La sesión no es válida');

    // El guard es el único 401 y ninguna ruta privada ejecuta nada sin sesión válida.
    assert.equal(harness.repo.sessionUserReadCalls, 0);
    // Un token válido sí consulta al usuario y responde 200.
    const ok = await me(base, token);
    assert.equal(ok.status, 200);
    assert.equal(harness.repo.sessionUserReadCalls, 1);
  });
});

test('S11: la cuenta sin verificar acumula fallos; la contraseña correcta responde 403 y no limpia la racha', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    // Registro sin confirmar el correo.
    const registered = await post(base, '/api/auth/register', VALID_BODY);
    assert.equal(registered.status, 201);
    const userId = (registered.json as { user: { id: string } }).user.id;

    const wrong = await login(base, VALID_BODY.email, 'malaClave99');
    assert.equal(wrong.status, 401, `cuerpo: ${wrong.text}`);
    assert.equal(harness.repo.loginStateOf(VALID_BODY.email).failedLoginAttempts, 1);

    const correct = await login(base, VALID_BODY.email, VALID_BODY.password);
    assert.equal(correct.status, 403, `cuerpo: ${correct.text}`);
    const envelope = errorEnvelope(correct.json);
    assert.equal(envelope.code, 'EMAIL_NOT_VERIFIED');
    assert.equal(envelope.details, undefined);
    assert.equal((correct.json as { token?: unknown }).token, undefined);

    // La racha no se limpió: la cuenta puede bloquearse sin haber confirmado el correo.
    assert.equal(harness.repo.loginStateOf(VALID_BODY.email).failedLoginAttempts, 1);
    assert.equal(harness.repo.clearedLoginStreaks, 0);
    assert.equal(userId.length > 0, true);
  });
});

test('S12: estando bloqueada, la contraseña correcta también se rechaza con 429 y sin token', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher(), lockoutMaxAttempts: 2 });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    await login(base, fixture.email, 'malaClave99');
    await login(base, fixture.email, 'malaClave99');
    const locked = await login(base, fixture.email, fixture.password);
    assert.equal(locked.status, 429, `cuerpo: ${locked.text}`);
    const envelope = errorEnvelope(locked.json);
    assert.equal(envelope.code, 'ACCOUNT_LOCKED');
    assert.ok(!('token' in (locked.json as object)), 'el bloqueo no emite token');
  });
});

test('S13: el cuerpo del 429 de bloqueo es exactamente el del contrato (retryAfterSeconds 900 al bloquear)', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await login(base, fixture.email, 'malaClave99');
    }
    const fifth = await login(base, fixture.email, 'malaClave99');
    assert.equal(fifth.status, 429);
    assert.deepEqual(fifth.json, LOCKED_BODY);
    const seconds = (fifth.json as { error: { details: { retryAfterSeconds: number } } }).error.details
      .retryAfterSeconds;
    assert.equal(seconds, 900);
  });
});

// ---------------------------------------------------------------------------
// Correcciones de la verificación independiente (C2 y las pruebas pinza de C5).
// ---------------------------------------------------------------------------

/* C2 — el contador de fallos es atómico y no pierde incrementos. */

/**
 * Hasher lento con un temporizador de verdad: bcryptjs bloquea el event loop y
 * serializaría los pedidos (con él, hasta el CAS viejo "contaba" los fallos).
 * Este doble deja que los 20 pedidos se traslapen de verdad — como en Mongo.
 */
const slowHasher = {
  hash: async (plain: string): Promise<string> => `$2a$10$fakestoredhashfor${plain}`,
  compare: async (plain: string, passwordHash: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return passwordHash === `$2a$10$fakestoredhashfor${plain}`;
  },
};

test('C2: 20 fallos en paralelo persisten exactamente 20 — el contador no pierde incrementos', async () => {
  // Umbral lejos (100): ninguna carrera dispara el bloqueo y cada fallo cuenta.
  const harness = makeHarness({
    hasher: slowHasher,
    lockoutMaxAttempts: 100,
    loginIpMaxAttempts: 100,
  });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => login(base, fixture.email, 'malaClave99')),
    );
    for (const result of results) {
      assert.equal(result.status, 401, `cuerpo: ${result.text}`);
    }
    const stored = harness.repo.loginStateOf(fixture.email);
    assert.equal(stored.failedLoginAttempts, 20, 'cada fallo cuenta exactamente una vez');
    assert.equal(stored.lockedUntil, null);
    // Ninguna otra cuenta cambió.
    assert.equal(harness.repo.users.size, 1);
  });
});

test('C2 (doble de repositorio): cada escritura incrementa exactamente una vez, también en paralelo', async () => {
  // El doble SÍ puede expresar la propiedad de incremento único: su escritura
  // es un incremento incondicional por llamada — la misma semántica del `$inc`
  // del adaptador real. 25 llamadas simultáneas han de producir la racha
  // 1..25 sin huecos ni duplicados, algo que un contador condicionado a los
  // valores leídos (CAS) no puede garantizar.
  const repo = new InMemoryUserRepository();
  const email = 'concurrencia@example.com';
  await repo.save({
    email,
    passwordHash: 'hash-de-prueba',
    fullName: 'Concurrencia',
    role: 'CAREGIVER',
    consent: { acceptedTermsAt: FIXED_NOW, termsVersion: TERMS_VERSION },
  });
  const config = { maxAttempts: 100, lockMs: 15 * 60_000, now: FIXED_NOW };
  const results = await Promise.all(
    Array.from({ length: 25 }, () => repo.registerFailedLogin(email, config)),
  );
  assert.deepEqual(
    results.map((r) => (r === null ? -1 : r.failedLoginAttempts)).sort((a, b) => a - b),
    Array.from({ length: 25 }, (_, i) => i + 1),
    'racha única 1..25: sin incrementos perdidos ni duplicados',
  );
  const stored = repo.loginStateOf(email);
  assert.equal(stored.failedLoginAttempts, 25);
  assert.equal(stored.lockedUntil, null);
});

/* C5 — las pruebas pinza que dejó listas la verificación independiente. */

test('S2: los dos 401 comparten también los headers, no sólo el cuerpo', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    await verifiedUser(harness, base);
    const send = async (email: string, password: string): Promise<Response> =>
      fetch(`${base}${LOGIN}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    const unknownEmail = await send('fantasma@example.com', VALID_BODY.password);
    const wrongPassword = await send(VALID_BODY.email, 'otraClave99');
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.status, 401);
    const headersOf = (response: Response): Record<string, string> => {
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key !== 'date') headers[key] = value; // la fecha depende del reloj, no del caso
      });
      return headers;
    };
    assert.deepEqual(headersOf(wrongPassword), headersOf(unknownEmail));
    // Nada delata el campo ni sugiere un flujo distinto.
    assert.equal(headersOf(unknownEmail)['www-authenticate'], undefined);
    assert.equal(headersOf(unknownEmail)['set-cookie'], undefined);
    // El cuerpo idéntico ya lo compara el test S2 de arriba; acá completa la respuesta.
    assert.equal(await unknownEmail.text(), await wrongPassword.text());
  });
});

test('D1: un correo sin cuenta jamás responde 429 ni escribe estado, aún con el umbral por debajo', async () => {
  // LOCKOUT_MAX_ATTEMPTS=2: si el fantasma contara fallos, el 2.º intento ya sería 429.
  const harness = makeHarness({
    hasher: new BcryptPasswordHasher(),
    lockoutMaxAttempts: 2,
    loginIpMaxAttempts: 100,
  });
  await withServer(harness, async (base) => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const result = await login(base, 'fantasma@example.com', VALID_BODY.password);
      assert.equal(result.status, 401, `intento ${attempt}: ${result.text}`);
      assert.equal(errorEnvelope(result.json).message, 'Credenciales inválidas');
      assert.equal(errorEnvelope(result.json).details, undefined);
    }
    assert.equal(harness.repo.failedLoginWrites, 0, 'ninguna escritura para correos sin cuenta');
    assert.equal(harness.repo.lockoutStates.size, 0, 'ningún estado de bloqueo creado');
    assert.deepEqual(harness.repo.loginStateOf('fantasma@example.com'), {
      failedLoginAttempts: null,
      lockedUntil: null,
      sessionVersion: null,
    });
  });
});

test('S3: el bloqueo corre desde el último fallo — lockedUntil es hora_del_último_fallo + 15min', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher(), lockoutMaxAttempts: 2 });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const first = await login(base, fixture.email, 'malaClave99');
    assert.equal(first.status, 401);
    // El reloj inyectado deja mover el tiempo sin dormir el test.
    const later = new Date(FIXED_NOW.getTime() + 7 * 60_000);
    harness.clock.now = later;
    const second = await login(base, fixture.email, 'malaClave99');
    assert.equal(second.status, 429, `cuerpo: ${second.text}`);
    assert.equal(
      harness.repo.loginStateOf(fixture.email).lockedUntil?.toISOString(),
      new Date(later.getTime() + 15 * 60_000).toISOString(),
      'el vencimiento se cuenta desde el último fallo, no desde el primero',
    );
  });
});

test('S9/D3: el 429 por IP no toca la base — ni lectura, ni escritura, ni limpieza de racha', async () => {
  const harness = makeHarness({
    hasher: new BcryptPasswordHasher(),
    loginIpMaxAttempts: 1,
    app: { trustProxyHops: 1 },
  });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    // El fallo único de la ventana en esta IP.
    await login(base, fixture.email, 'malaClave99', { 'x-forwarded-for': IP_A });
    const readsBefore = harness.repo.findCredentialsCalls;
    const writesBefore = harness.repo.failedLoginWrites;
    const clearingsBefore = harness.repo.clearedLoginStreaks;
    // Con la contraseña correcta: si llegara a la base limpiaría la racha — no debe.
    const blocked = await login(base, fixture.email, fixture.password, { 'x-forwarded-for': IP_A });
    assert.equal(blocked.status, 429, `cuerpo: ${blocked.text}`);
    assert.equal(errorEnvelope(blocked.json).code, 'TOO_MANY_REQUESTS');
    assert.equal(harness.repo.findCredentialsCalls, readsBefore, 'sin lectura de credenciales');
    assert.equal(harness.repo.failedLoginWrites, writesBefore, 'sin escritura de fallo');
    assert.equal(harness.repo.clearedLoginStreaks, clearingsBefore, 'sin limpieza de racha');
  });
});

test('S10: el guard responde un solo 401 con uno de exactamente dos textos', async () => {
  const harness = makeHarness({ hasher: new BcryptPasswordHasher() });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const MISSING = 'Falta el token de sesión';
    const INVALID = 'La sesión no es válida';
    const forged = jwt.sign(
      { email: fixture.email, role: 'CAREGIVER', sv: 0 },
      'otro-secreto',
      { subject: fixture.userId, expiresIn: '7d' },
    );
    const expired = jwt.sign(
      { email: fixture.email, role: 'CAREGIVER', sv: 0 },
      TEST_JWT_SECRET,
      { subject: fixture.userId, expiresIn: -1 },
    );
    const badSv = jwt.sign(
      { email: fixture.email, role: 'CAREGIVER', sv: 'cero' },
      TEST_JWT_SECRET,
      { subject: fixture.userId, expiresIn: '7d' },
    );
    const cases: Array<{ name: string; header?: string; expected: string }> = [
      { name: 'sin header', expected: MISSING },
      { name: 'sin el esquema Bearer', header: 'esto-no-es-un-jwt', expected: MISSING },
      { name: 'malformado', header: 'Bearer esto-no-es-un-jwt', expected: INVALID },
      { name: 'firma ajena', header: `Bearer ${forged}`, expected: INVALID },
      { name: 'vencido', header: `Bearer ${expired}`, expected: INVALID },
      { name: 'sv malformado', header: `Bearer ${badSv}`, expected: INVALID },
    ];
    const bodies = new Set<string>();
    for (const scenario of cases) {
      const result = await me(
        base,
        null,
        scenario.header === undefined ? {} : { authorization: scenario.header },
      );
      assert.equal(result.status, 401, `${scenario.name}: ${result.text}`);
      assert.equal(errorEnvelope(result.json).message, scenario.expected, scenario.name);
      bodies.add(JSON.stringify(result.json));
    }
    // Un solo molde de 401 con dos textos: todas las sesiones inválidas
    // comparten cuerpo byte a byte y la ausencia de token responde el otro texto.
    assert.deepEqual(
      [...bodies].sort(),
      [
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: INVALID } }),
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: MISSING } }),
      ].sort(),
    );
  });
});

test('S6: exp sigue JWT_EXPIRES_IN — 2h produce una vigencia de 3600 segundos', async () => {
  // loadEnv resuelve el valor igual que el arranque real: lo que entra al
  // harness es lo que el backend leería del entorno.
  const { jwtExpiresIn } = loadEnv({ JWT_EXPIRES_IN: '2h' });
  const harness = makeHarness({ hasher: new BcryptPasswordHasher(), jwtExpiresIn });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const result = await login(base, fixture.email, fixture.password);
    assert.equal(result.status, 200, `cuerpo: ${result.text}`);
    const claims = jwt.decode((result.json as { token: string }).token) as Record<string, unknown>;
    assert.equal((claims['exp'] as number) - (claims['iat'] as number), 7200);
  });
});

test('C3/S6: un JWT_EXPIRES_IN malformado cae a 7d en toda la cadena — login 200, no 500', async () => {
  const { jwtExpiresIn } = loadEnv({ JWT_EXPIRES_IN: 'no-es-duracion' });
  const harness = makeHarness({ hasher: new BcryptPasswordHasher(), jwtExpiresIn });
  await withServer(harness, async (base) => {
    const fixture = await verifiedUser(harness, base);
    const result = await login(base, fixture.email, fixture.password);
    assert.equal(result.status, 200, `cuerpo: ${result.text}`);
    const claims = jwt.decode((result.json as { token: string }).token) as Record<string, unknown>;
    assert.equal((claims['exp'] as number) - (claims['iat'] as number), 7 * 24 * 3600, 'cae al default 7d');
  });
});
