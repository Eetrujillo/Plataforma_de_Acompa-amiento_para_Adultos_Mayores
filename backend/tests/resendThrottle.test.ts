import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ResendThrottle } from '../src/modules/auth/application/ResendThrottle.ts';
import { loadEnv } from '../src/config/env.ts';
import {
  FIXED_NOW,
  VALID_BODY,
  errorEnvelope,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';

const REGISTER = '/api/auth/register';
const RESEND = '/api/auth/resend-verification';

/** Literal de docs/auth-api.md:94-102. */
const TOO_MANY_MESSAGE =
  'Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.';

function minutesFromNow(minutes: number): Date {
  return new Date(FIXED_NOW.getTime() + minutes * 60_000);
}

async function registerOk(base: string): Promise<void> {
  const result = await post(base, REGISTER, VALID_BODY);
  assert.equal(result.status, 201, `cuerpo: ${result.text}`);
}

test('S4: los tres primeros reenvíos dentro de la hora se aceptan (202) y el cuarto responde 429 con retryAfterSeconds', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerOk(base);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await post(base, RESEND, { email: VALID_BODY.email });
      assert.equal(result.status, 202, `reenvío ${attempt}: ${result.text}`);
      assert.deepEqual(result.json, { accepted: true });
    }
    // 1 del registro + 3 reenvíos: los tres primeros reenvíos salieron.
    assert.equal(harness.sender.sent.length, 4);

    const fourth = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(fourth.status, 429, `cuerpo: ${fourth.text}`);
    const envelope = errorEnvelope(fourth.json);
    assert.equal(envelope.code, 'TOO_MANY_REQUESTS');
    assert.equal(envelope.message, TOO_MANY_MESSAGE);
    const details = envelope.details as { retryAfterSeconds: number } | undefined;
    assert.ok(details, 'el 429 trae details.retryAfterSeconds');
    assert.equal(details.retryAfterSeconds, 3600);
    // El intento bloqueado no dispara correo.
    assert.equal(harness.sender.sent.length, 4);
  });
});

test('S4: la ventana móvil vence: agotada la hora, el reenvío vuelve a aceptarse', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerOk(base);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await post(base, RESEND, { email: VALID_BODY.email });
      assert.equal(result.status, 202);
    }
    assert.equal((await post(base, RESEND, { email: VALID_BODY.email })).status, 429);

    harness.clock.now = minutesFromNow(61);
    const again = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(again.status, 202, `cuerpo: ${again.text}`);
    assert.deepEqual(again.json, { accepted: true });
    assert.equal(harness.sender.sent.length, 5);
  });
});

test('S4: el intento bloqueado no se registra: reintentar no alarga el bloqueo', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerOk(base);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.equal((await post(base, RESEND, { email: VALID_BODY.email })).status, 202);
    }

    // Cuarto intento a los 55 minutos: 429 y el bloqueo vence con la ventana del primero.
    harness.clock.now = minutesFromNow(55);
    const blocked = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(blocked.status, 429);
    const details = errorEnvelope(blocked.json).details as { retryAfterSeconds: number };
    assert.equal(details.retryAfterSeconds, 300);

    // A los 61 minutos los tres reenvíos originales ya vencieron: se vuelve a permitir.
    // Si los intentos bloqueados se contaran, el de los 55 minutos seguiría vivo y daría 429.
    harness.clock.now = minutesFromNow(61);
    const after = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(after.status, 202, `cuerpo: ${after.text}`);
  });
});

test('S7: un correo sin cuenta consume cupo igual: 202 idéntico y 429 al cuarto intento', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await post(base, RESEND, { email: 'fantasma@example.com' });
      assert.equal(result.status, 202, `reenvío ${attempt}: ${result.text}`);
      assert.deepEqual(result.json, { accepted: true });
    }
    assert.equal(harness.sender.sent.length, 0, 'a un correo sin cuenta no se le envía nada');

    const fourth = await post(base, RESEND, { email: 'fantasma@example.com' });
    assert.equal(fourth.status, 429, `cuerpo: ${fourth.text}`);
    assert.equal(errorEnvelope(fourth.json).code, 'TOO_MANY_REQUESTS');
    const details = errorEnvelope(fourth.json).details as { retryAfterSeconds: number };
    assert.equal(details.retryAfterSeconds, 3600);
  });
});

test('S7: una cuenta ya verificada consume cupo igual y no recibe más correos', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerOk(base);
    const verified = await post(base, '/api/auth/verify-email', {
      token: new URL(harness.sender.sent[0]!.link).searchParams.get('token'),
    });
    assert.equal(verified.status, 200);
    assert.equal(harness.sender.sent.length, 1);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await post(base, RESEND, { email: VALID_BODY.email });
      assert.equal(result.status, 202, `reenvío ${attempt}: ${result.text}`);
      assert.deepEqual(result.json, { accepted: true });
    }
    assert.equal(harness.sender.sent.length, 1, 'a una cuenta verificada no se le reenvía correo');

    const fourth = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(fourth.status, 429, `cuerpo: ${fourth.text}`);
  });
});

test('S7: un correo con formato inválido responde 400 INVALID_EMAIL y no consume cupo', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await post(base, RESEND, { email: 'no-es-un-correo' });
      assert.equal(result.status, 400, `intento ${attempt}: ${result.text}`);
      assert.equal(errorEnvelope(result.json).code, 'INVALID_EMAIL');
    }
    assert.equal(harness.repo.stateLookups, 0, 'el formato inválido no llega a consultar la cuenta');
    assert.equal(harness.repo.saveTokenCalls, 0);
    assert.equal(harness.sender.sent.length, 0);

    // El límite de una cuenta real no fue tocado por los intentos inválidos.
    await registerOk(base);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.equal((await post(base, RESEND, { email: VALID_BODY.email })).status, 202);
    }
    assert.equal((await post(base, RESEND, { email: VALID_BODY.email })).status, 429);
  });
});

test('rate-limiting: la clave se normaliza; mayúsculas y espacios comparten contador', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerOk(base);
    const variants = [
      'Cuidador@Example.com',
      '  cuidador@example.com ',
      'CUIDADOR@EXAMPLE.COM',
    ];
    for (const [attempt, email] of variants.entries()) {
      const result = await post(base, RESEND, { email });
      assert.equal(result.status, 202, `variante ${attempt + 1} (${email}): ${result.text}`);
    }
    const fourth = await post(base, RESEND, { email: 'cuidador@example.com' });
    assert.equal(fourth.status, 429, 'la cuarta variante agotó el mismo contador');
  });
});

test('C3: RESEND_THROTTLE_MAX y RESEND_THROTTLE_WINDOW_MINUTES aceptan sólo enteros positivos', () => {
  // Válidos se respetan.
  assert.equal(loadEnv({ RESEND_THROTTLE_MAX: '5' }).resendThrottleMax, 5);
  assert.equal(loadEnv({ RESEND_THROTTLE_WINDOW_MINUTES: '90' }).resendThrottleWindowMinutes, 90);

  // C3: vacío, 0, negativo o malformado caen al default (3 / 60): un límite de
  // tasa no se puede desactivar por configuración accidental.
  const invalidos = ['0', '-1', 'abc', '1.5', '', '   ', '3x', '+3'];
  for (const invalido of invalidos) {
    assert.equal(
      loadEnv({ RESEND_THROTTLE_MAX: invalido }).resendThrottleMax,
      3,
      `RESEND_THROTTLE_MAX=${JSON.stringify(invalido)} cae al default`,
    );
    assert.equal(
      loadEnv({ RESEND_THROTTLE_WINDOW_MINUTES: invalido }).resendThrottleWindowMinutes,
      60,
      `RESEND_THROTTLE_WINDOW_MINUTES=${JSON.stringify(invalido)} cae al default`,
    );
  }
  assert.equal(loadEnv({}).resendThrottleMax, 3);
  assert.equal(loadEnv({}).resendThrottleWindowMinutes, 60);
});

test('unidad ResendThrottle: ventana vencida vuelve a permitir, clave normalizada comparte contador y el tope de claves poda el store', () => {
  let now = FIXED_NOW.getTime();
  const clock = { now: () => new Date(now) };
  const throttle = new ResendThrottle(clock, { max: 2, windowMs: 60_000 }, 3);

  assert.deepEqual(throttle.consume('Uno@Example.com'), { allowed: true });
  assert.deepEqual(throttle.consume(' uno@example.com '), { allowed: true });
  const blocked = throttle.consume('UNO@example.com');
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.retryAfterSeconds, 60);

  // Tope de claves: la clave más vieja se descarta para que el store no crezca sin límite.
  assert.deepEqual(throttle.consume('dos@example.com'), { allowed: true });
  assert.deepEqual(throttle.consume('tres@example.com'), { allowed: true });
  assert.equal(throttle.consume('uno@example.com').allowed, true, 'uno fue podado por el tope');

  // Ventana vencida vuelve a permitir.
  now += 61_000;
  assert.deepEqual(throttle.consume('dos@example.com'), { allowed: true });
});
