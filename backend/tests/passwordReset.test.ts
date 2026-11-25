import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  VALID_BODY,
  errorEnvelope,
  makeHarness,
  post,
  get,
  withServer,
} from './support/registerHarness.ts';
import type { Harness } from './support/registerHarness.ts';
import { createEmailSender } from '../src/modules/auth/infrastructure/EmailSender.ts';
import { CapturingLogger } from './support/registerHarness.ts';
import { loadEnv } from '../src/config/env.ts';

const REGISTER = '/api/auth/register';
const VERIFY = '/api/auth/verify-email';
const RESEND = '/api/auth/resend-verification';
const FORGOT = '/api/auth/forgot-password';
const RESET = '/api/auth/reset-password';
const ME = '/api/auth/me';
const MINUTE_MS = 60_000;

/** Literal de docs/auth-api.md:268-269 (S5): un solo mensaje para todo token que no sirve. */
const INVALID_TOKEN_MESSAGE = 'El enlace para restablecer la contraseña no es válido o ya venció';
/** Mensaje exacto de la regla del alta (S7): la misma de HU-001. */
const WEAK_PASSWORD_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, con al menos una letra y un dígito';

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

/** Registra y verifica el correo para que la cuenta pueda loguear (S3). */
async function registerVerified(
  harness: Harness,
  base: string,
  email: string = VALID_BODY.email,
): Promise<void> {
  const registered = await post(base, REGISTER, { ...VALID_BODY, email });
  assert.equal(registered.status, 201, registered.text);
  const verifyToken = tokenFromLink(harness.sender.sent[harness.sender.sent.length - 1]!.link);
  const verified = await post(base, VERIFY, { token: verifyToken });
  assert.equal(verified.status, 200, verified.text);
}

/** Pide el enlace de reset y devuelve el token en claro (del correo, nunca de una respuesta). */
async function requestResetToken(
  harness: Harness,
  base: string,
  email: string = VALID_BODY.email,
): Promise<string> {
  const forgot = await post(base, FORGOT, { email });
  assert.equal(forgot.status, 202, forgot.text);
  const message = harness.sender.passwordResets[harness.sender.passwordResets.length - 1];
  assert.ok(message, 'el pedido disparó el correo de reset');
  return tokenFromLink(message.link);
}

// ─── S1 ─────────────────────────────────────────────────────────────────────

test('S1: forgot-password responde 202 { accepted: true } exista, no exista o no tenga contraseña', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;

    const existing = await post(base, FORGOT, { email: VALID_BODY.email });
    const unknown = await post(base, FORGOT, { email: 'nadie@example.com' });
    // Cuenta sin contraseña (Google): misma respuesta, nada que restablecer.
    harness.repo.addAccountWithoutPassword('google@example.com', 'Cuenta Google');
    const google = await post(base, FORGOT, { email: 'google@example.com' });

    const expected = '{"accepted":true}';
    for (const [name, result] of [
      ['cuenta real', existing],
      ['correo desconocido', unknown],
      ['cuenta sin contraseña', google],
    ] as const) {
      assert.equal(result.status, 202, `${name}: ${result.text}`);
      assert.equal(result.text, expected, `${name} responde el cuerpo genérico exacto`);
    }
    // Anti-oráculo: la respuesta del correo real y la del inventado son byte-iguales.
    assert.equal(existing.text, unknown.text);
    assert.equal(existing.text, google.text);
  });
});

test('S1: un correo con formato inválido es 400 INVALID_EMAIL y NO consume cupo del limitador', async () => {
  const harness = makeHarness({ forgotThrottleMax: 1 });
  await withServer(harness, async (base) => {
    const invalid = await post(base, FORGOT, { email: 'no-es-un-correo' });
    assert.equal(invalid.status, 400, invalid.text);
    const envelope = errorEnvelope(invalid.json);
    assert.equal(envelope.code, 'INVALID_EMAIL');

    // Con un cupo de 1, el formato inválido no lo gastó: el único cupo queda.
    const valid = await post(base, FORGOT, { email: 'nadie@example.com' });
    assert.equal(valid.status, 202, valid.text);

    // Faltante del cuerpo: 400 INVALID_BODY (contrato), y tampoco gasta cupo.
    const missing = await post(base, FORGOT, {});
    assert.equal(missing.status, 400);
    assert.equal(errorEnvelope(missing.json).code, 'INVALID_BODY');
    const second = await post(base, FORGOT, { email: 'otro@example.com' });
    assert.equal(second.status, 202, second.text);
  });
});

// ─── S2 ─────────────────────────────────────────────────────────────────────

test('S2: el enlace funciona una sola vez y expira en 60 minutos con el reloj inyectado', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);

    // Un solo uso: el segundo intento con el mismo token responde igual que uno inválido.
    const token = await requestResetToken(harness, base);
    const first = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.json, { reset: true });
    const second = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(second.status, 400, second.text);
    const envelope = errorEnvelope(second.json);
    assert.equal(envelope.code, 'INVALID_TOKEN');
    assert.equal(envelope.message, INVALID_TOKEN_MESSAGE);

    // Expira: otro pedido, el reloj avanza 60 minutos y ya no sirve.
    const expiring = await requestResetToken(harness, base);
    harness.clock.now = new Date(harness.clock.now.getTime() + 60 * MINUTE_MS + 1);
    const expired = await post(base, RESET, { token: expiring, password: 'clavesNueva9' });
    assert.equal(expired.status, 400, expired.text);
    assert.equal(errorEnvelope(expired.json).code, 'INVALID_TOKEN');
    assert.equal(expired.text, second.text, 'vencido responde igual que ya usado');
  });
});

// ─── S3 ─────────────────────────────────────────────────────────────────────

test('S3: el reset guarda el hash nuevo, limpia el bloqueo y sube sessionVersion en la MISMA operación', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);

    // Sesión viva antes del cambio.
    const loggedIn = await post(base, '/api/auth/login', {
      email: VALID_BODY.email,
      password: VALID_BODY.password,
    });
    assert.equal(loggedIn.status, 200, loggedIn.text);
    const { token } = loggedIn.json as { token: string };

    // Bloqueo la cuenta con 5 contraseñas equivocadas (HU-003).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await post(base, '/api/auth/login', {
        email: VALID_BODY.email,
        password: 'equivocada1',
      });
      assert.equal(wrong.status, attempt === 4 ? 429 : 401, wrong.text);
    }
    assert.ok(
      (harness.repo.loginStateOf(VALID_BODY.email).lockedUntil ?? null) !== null,
      'la cuenta quedó bloqueada antes del reset',
    );

    const token0 = await requestResetToken(harness, base);
    const reset = await post(base, RESET, { token: token0, password: 'clavesNueva9' });
    assert.equal(reset.status, 200, reset.text);
    assert.deepEqual(reset.json, { reset: true });

    // Una sola escritura para los tres efectos (D4); consume previo (S6/D3).
    assert.equal(harness.repo.resetPasswordWrites, 1);
    assert.deepEqual(harness.repo.resetCalls, ['consume', 'resetPassword']);
    assert.deepEqual(harness.repo.loginStateOf(VALID_BODY.email), {
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: 1,
    });

    // Todo JWT emitido antes deja de servir: 401 en /me con el token viejo.
    const meOld = await get(base, ME, { authorization: `Bearer ${token}` });
    assert.equal(meOld.status, 401, meOld.text);
    assert.equal(errorEnvelope(meOld.json).code, 'UNAUTHORIZED');

    // El hash nuevo es el que vale: la vieja falla, la nueva loguea.
    const oldLogin = await post(base, '/api/auth/login', {
      email: VALID_BODY.email,
      password: VALID_BODY.password,
    });
    assert.equal(oldLogin.status, 401, oldLogin.text);
    assert.equal(errorEnvelope(oldLogin.json).code, 'UNAUTHORIZED');
    const newLogin = await post(base, '/api/auth/login', {
      email: VALID_BODY.email,
      password: 'clavesNueva9',
    });
    assert.equal(newLogin.status, 200, newLogin.text);
    const meNew = await get(base, ME, {
      authorization: `Bearer ${(newLogin.json as { token: string }).token}`,
    });
    assert.equal(meNew.status, 200, meNew.text);
  });
});

// ─── S4 ─────────────────────────────────────────────────────────────────────

test('S4: la base guarda sólo sha256(token); el token en claro no aparece en respuesta ni log alguno', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    const forgot = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(forgot.status, 202, forgot.text);
    const message = harness.sender.passwordResets[0]!;
    const raw = tokenFromLink(message.link);

    // Persistido: exactamente el SHA-256 del token en claro, 64 hex, y nada más.
    assert.equal(harness.repo.passwordResetTokens.size, 1);
    const saved = [...harness.repo.passwordResetTokens.values()][0]!;
    assert.equal(saved.tokenHash, createHash('sha256').update(raw, 'utf8').digest('hex'));
    assert.match(saved.tokenHash, /^[0-9a-f]{64}$/);
    assert.ok(!saved.email.includes(raw));

    // Ni la respuesta del 202 ni la del 200 contienen el token en claro.
    assert.ok(!forgot.text.includes(raw), 'el 202 no delata el token');
    const reset = await post(base, RESET, { token: raw, password: 'clavesNueva9' });
    assert.equal(reset.status, 200, reset.text);
    assert.ok(!reset.text.includes(raw), 'el 200 no delata el token');

    // El canal de la suite es el doble (SMTP), así que acá ningún log lo trajo;
    // el único lugar donde el token en claro existe es el mensaje del correo.
    assert.ok(!harness.logger.infos.some((line) => line.includes(raw)));
    assert.ok(!harness.logger.warns.some((line) => line.includes(raw)));

    // El enlace se arma con APP_URL (nunca con el Host del pedido).
    assert.ok(message.link.startsWith('https://app.ejemplo.test/reset-password?token='));
  });
});

// ─── S5 ─────────────────────────────────────────────────────────────────────

test('S5: vencido, ya usado, inexistente y malformado responden byte-idénticos, 400 INVALID_TOKEN sin details', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);

    const usedToken = await requestResetToken(harness, base);
    const ok = await post(base, RESET, { token: usedToken, password: 'clavesNueva9' });
    assert.equal(ok.status, 200);
    const used = await post(base, RESET, { token: usedToken, password: 'clavesNueva9' });

    const expiredToken = await requestResetToken(harness, base);
    harness.clock.now = new Date(harness.clock.now.getTime() + 120 * MINUTE_MS);
    const expired = await post(base, RESET, { token: expiredToken, password: 'clavesNueva9' });
    // Con el reloj avanzado, el primer token registrado también está vencido.

    const unknown = await post(base, RESET, { token: 'a'.repeat(43), password: 'clavesNueva9' });
    const malformed = await post(base, RESET, { token: 'abc', password: 'clavesNueva9' });

    const expected = JSON.stringify({
      error: { code: 'INVALID_TOKEN', message: INVALID_TOKEN_MESSAGE },
    });
    for (const [name, result] of [
      ['usado', used],
      ['vencido', expired],
      ['inexistente', unknown],
      ['malformado', malformed],
    ] as const) {
      assert.equal(result.status, 400, `${name}: ${result.text}`);
      assert.equal(result.text, expected, `${name} responde byte-idéntico`);
      const envelope = errorEnvelope(result.json);
      assert.equal(envelope.code, 'INVALID_TOKEN', name);
      assert.equal(envelope.message, INVALID_TOKEN_MESSAGE, name);
      assert.equal(envelope.details, undefined, `${name} no delata cuál fue el motivo`);
    }
  });
});

// ─── S6 ─────────────────────────────────────────────────────────────────────

test('S6: dos canjes simultáneos del mismo token dan un 200 y un 400; el consume precede a la escritura', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    const token = await requestResetToken(harness, base);

    const [first, second] = await Promise.all([
      post(base, RESET, { token, password: 'clavesNueva9' }),
      post(base, RESET, { token, password: 'clavesNueva9' }),
    ]);
    assert.deepEqual(
      [first.status, second.status].sort(),
      [200, 400],
      `uno: ${first.text} · otro: ${second.text}`,
    );

    // La escritura de la contraseña sucedió exactamente una vez y después del
    // consumo (D3): en el doble, 'consume' precede a 'resetPassword'.
    assert.equal(harness.repo.resetPasswordWrites, 1);
    const consumeIndex = harness.repo.resetCalls.indexOf('consume');
    const writeIndex = harness.repo.resetCalls.indexOf('resetPassword');
    assert.ok(consumeIndex !== -1 && writeIndex !== -1);
    assert.ok(consumeIndex < writeIndex, 'el consume es previo a tocar la cuenta');
  });
});

test('S6/D3 (fail closed): si la escritura de la contraseña falla, el enlace queda quemado y la cuenta intacta', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    const token = await requestResetToken(harness, base);

    harness.repo.resetPasswordError = new Error('mongo caído');
    const failed = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(failed.status, 500, failed.text);
    assert.equal(errorEnvelope(failed.json).code, 'INTERNAL_ERROR');
    assert.ok(!failed.text.includes(token), 'el 500 no delata el token');

    // La cuenta quedó intacta: la contraseña vieja todavía loguea.
    harness.repo.resetPasswordError = null;
    const oldLogin = await post(base, '/api/auth/login', {
      email: VALID_BODY.email,
      password: VALID_BODY.password,
    });
    assert.equal(oldLogin.status, 200, oldLogin.text);

    // Y el enlace quedó quemado por el consume previo: el reintento es INVALID_TOKEN.
    const retry = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(retry.status, 400, retry.text);
    assert.equal(retry.text, JSON.stringify({ error: { code: 'INVALID_TOKEN', message: INVALID_TOKEN_MESSAGE } }));
  });
});

// ─── S7 ─────────────────────────────────────────────────────────────────────

test('S7: WEAK_PASSWORD no quema el enlace: la contraseña se valida antes de tocar el token', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;
    const token = await requestResetToken(harness, base);

    for (const weak of ['corta1', 'sindigitos', '12345678']) {
      const rejected = await post(base, RESET, { token, password: weak });
      assert.equal(rejected.status, 400, `${weak}: ${rejected.text}`);
      const envelope = errorEnvelope(rejected.json);
      assert.equal(envelope.code, 'WEAK_PASSWORD', weak);
      assert.equal(envelope.message, WEAK_PASSWORD_MESSAGE);
      assert.deepEqual(envelope.details, { field: 'password' });
      assert.equal(harness.repo.resetConsumeCalls, 0, 'el token no fue tocado');
    }

    // El enlace sigue vigente: con una contraseña válida se completa el cambio.
    const retry = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(retry.status, 200, retry.text);
    assert.deepEqual(retry.json, { reset: true });
  });
});

test('contrato: reset-password con cuerpo inválido es 400 INVALID_BODY, y forgot-password también', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const cases = [
      { token: 'a'.repeat(43) }, // falta password
      { password: 'clavesNueva9' }, // falta token
      { token: 42, password: 'clavesNueva9' }, // token no textual
      { token: 'a'.repeat(43), password: 42 }, // password no textual
    ] as const;
    for (const [index, body] of cases.entries()) {
      const result = await post(base, RESET, body);
      assert.equal(result.status, 400, `caso ${index}: ${result.text}`);
      assert.equal(errorEnvelope(result.json).code, 'INVALID_BODY', `caso ${index}`);
    }
    assert.equal(harness.repo.resetConsumeCalls, 0, 'un cuerpo inválido no consume nada');

    const forgotCases = [{}, { email: 42 }] as const;
    for (const [index, body] of forgotCases.entries()) {
      const result = await post(base, FORGOT, body);
      assert.equal(result.status, 400, `forgot ${index}: ${result.text}`);
      assert.equal(errorEnvelope(result.json).code, 'INVALID_BODY', `forgot ${index}`);
    }
  });
});

// ─── S8 ─────────────────────────────────────────────────────────────────────

test('S8: pedir un enlace nuevo quema el anterior: sólo sirve el último enviado', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;

    const oldToken = await requestResetToken(harness, base);
    const newToken = await requestResetToken(harness, base);
    assert.notEqual(newToken, oldToken, 'cada pedido emite un token nuevo');

    const oldLink = await post(base, RESET, { token: oldToken, password: 'clavesNueva9' });
    assert.equal(oldLink.status, 400, oldLink.text);
    assert.equal(errorEnvelope(oldLink.json).code, 'INVALID_TOKEN');
    assert.equal(errorEnvelope(oldLink.json).message, INVALID_TOKEN_MESSAGE);

    const newLink = await post(base, RESET, { token: newToken, password: 'clavesNueva9' });
    assert.equal(newLink.status, 200, newLink.text);
    assert.deepEqual(newLink.json, { reset: true });

    // En la colección quedó solamente el último (D1: una entrada por cuenta).
    assert.equal(harness.repo.passwordResetTokens.size, 1);
  });
});

// ─── C4 ─────────────────────────────────────────────────────────────────────

test('C4: si la escritura no matchea ninguna cuenta, el reset responde 400 INVALID_TOKEN, no un 200 mentiroso', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    const token = await requestResetToken(harness, base);

    // Cuenta eliminada después de pedir el enlace: el token sigue sirviendo
    // para el consume, pero la escritura del reset ya no matchea a nadie.
    harness.repo.users.delete(VALID_BODY.email);
    const result = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(result.status, 400, result.text);
    assert.deepEqual(result.json, {
      error: { code: 'INVALID_TOKEN', message: INVALID_TOKEN_MESSAGE },
    });

    // Y una cuenta que SÍ existe sigue respondiendo 200: el reporte no
    // convierte el caso bueno en error.
    const second = makeHarness();
    await withServer(second, async (secondBase) => {
      await registerVerified(second, secondBase);
      const secondToken = await requestResetToken(second, secondBase);
      const ok = await post(secondBase, RESET, { token: secondToken, password: 'clavesNueva9' });
      assert.equal(ok.status, 200, ok.text);
      assert.deepEqual(ok.json, { reset: true });
    });
  });
});

// ─── S9 ─────────────────────────────────────────────────────────────────────

test('S9: 3 pedidos por hora por correo con cuenta propia del limitador; el cuarto es 429 con retryAfterSeconds', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;

    for (let request = 0; request < 3; request += 1) {
      const ok = await post(base, FORGOT, { email: VALID_BODY.email });
      assert.equal(ok.status, 202, `pedido ${request + 1}: ${ok.text}`);
    }
    const fourth = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(fourth.status, 429, fourth.text);
    const envelope = errorEnvelope(fourth.json);
    assert.equal(envelope.code, 'TOO_MANY_REQUESTS');
    assert.equal(envelope.message, 'Pediste demasiados enlaces de recuperación. Esperá unos minutos antes de pedir otro.');
    assert.deepEqual(envelope.details, { retryAfterSeconds: 3600 });
  });
});

test('S9: la clave del contador es el correo normalizado; los correos sin cuenta también consumen cupo', async () => {
  const harness = makeHarness({ forgotThrottleMax: 1 });
  await withServer(harness, async (base) => {
    // `Cuidador@Example.com` y `cuidador@example.com` comparten contador.
    const upper = await post(base, FORGOT, { email: 'Cuidador@Example.com' });
    assert.equal(upper.status, 202, upper.text);
    const lower = await post(base, FORGOT, { email: 'cuidador@example.com' });
    assert.equal(lower.status, 429, lower.text);
    assert.equal(errorEnvelope(lower.json).code, 'TOO_MANY_REQUESTS');
  });
});

test('S9: un correo sin cuenta también consume y agota su propio cupo (el 429 no es oráculo)', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    // Tres pedidos para un correo sin cuenta: los tres responden 202 igual…
    for (let request = 0; request < 3; request += 1) {
      const ok = await post(base, FORGOT, { email: 'inventado@example.com' });
      assert.equal(ok.status, 202, `pedido ${request + 1}: ${ok.text}`);
    }
    // …y el cuarto para el MISMO correo sin cuenta también se bloquea: el cupo
    // corre para correos con o sin cuenta, así el 429 no delata existencias.
    const fourth = await post(base, FORGOT, { email: 'inventado@example.com' });
    assert.equal(fourth.status, 429, fourth.text);
    assert.deepEqual(errorEnvelope(fourth.json).details, { retryAfterSeconds: 3600 });

    // La clave es por correo normalizado: la cuenta real tiene su propio cupo.
    const real = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(real.status, 202, real.text);
  });
});

test('S9: el límite de forgot-password es una instancia separada del límite de resend-verification', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);

    // Se agota el cupo de forgot-password (3)…
    for (let request = 0; request < 3; request += 1) {
      const ok = await post(base, FORGOT, { email: VALID_BODY.email });
      assert.equal(ok.status, 202, ok.text);
    }
    assert.equal((await post(base, FORGOT, { email: VALID_BODY.email })).status, 429);

    // …y el de reenvío de verificación sigue servible: son contadores distintos.
    const resend = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(resend.status, 202, resend.text);
    assert.deepEqual(resend.json, { accepted: true });
  });
});

test('S9: una pedida rechazada por 429 no consume cupo: la ventana no se alarga insistiendo', async () => {
  const harness = makeHarness({ forgotThrottleMax: 3, forgotThrottleWindowMinutes: 1 });
  await withServer(harness, async (base) => {
    for (let request = 0; request < 3; request += 1) {
      await post(base, FORGOT, { email: VALID_BODY.email });
    }
    const blocked = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(blocked.status, 429);
    // Insistir no alarga el bloqueo (skill rate-limiting regla 6).
    const firstRetry = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(firstRetry.status, 429, firstRetry.text);
    assert.equal(firstRetry.text, blocked.text, 'los 429 consecutivos son idénticos');

    // Pasada la ventana (1 minuto), el cupo se libera completo.
    harness.clock.now = new Date(harness.clock.now.getTime() + 1 * MINUTE_MS + 1);
    const freed = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(freed.status, 202, freed.text);
  });
});

// ─── S10 ────────────────────────────────────────────────────────────────────

test('S10: el correo de reset usa un método nuevo del puerto, con copy propio, y no reutiliza el de verificación', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;
    harness.sender.sent.length = 0;

    const result = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(result.status, 202, result.text);

    // Método nuevo, acumulado en su propia rama; el de verificación no fue tocado.
    assert.equal(harness.sender.passwordResets.length, 1);
    assert.equal(harness.sender.sent.length, 0);
    const message = harness.sender.passwordResets[0]!;
    assert.equal(message.to, VALID_BODY.email);
    assert.equal(message.fullName, 'Esteban Trujillo');
    assert.equal(message.expiresInMinutes, 60, 'anuncia el vencimiento en minutos');
    assert.ok(message.link.startsWith('https://app.ejemplo.test/reset-password?token='));
  });
});

test('S10 (canal console): sendPasswordResetEmail imprime el enlace con su aviso de un solo uso', async () => {
  const logger = new CapturingLogger();
  const sender = createEmailSender(
    { host: null, port: 587, secure: false, user: null, pass: null, from: 'Plataforma <no-reply@example.com>' },
    logger,
  );
  const result = await sender.sendPasswordResetEmail({
    to: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    link: 'https://app.ejemplo.test/reset-password?token=abc',
    expiresInMinutes: 60,
  });
  assert.deepEqual(result, { delivered: true, channel: 'console' });
  const logged = logger.infos.find((line) => line.includes('Enlace de restablecimiento'));
  assert.ok(logged, `el log incluye el enlace: ${JSON.stringify(logger.infos)}`);
  assert.ok(logged.includes('https://app.ejemplo.test/reset-password?token=abc'));
  assert.ok(logged.includes('un solo uso'), `con aviso de un solo uso: ${logged ?? ''}`);
});

test('S10: un envío caído no rompe la respuesta: sigue 202 { accepted: true } con un warn', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    harness.sender.passwordResets.length = 0;
    harness.sender.sent.length = 0;

    // Envío caído (delivered: false).
    harness.sender.failNextReset = true;
    const failed = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(failed.status, 202, failed.text);
    assert.deepEqual(failed.json, { accepted: true });
    assert.ok(harness.logger.warns.length > 0, 'queda un warn del envío caído');
    assert.ok(!harness.logger.warns[0]!.includes('reset-password?token='), 'el warn no trae el enlace');

    // Excepción del adaptador (envío que explota): mismo resultado.
    harness.sender.explodeReset = true;
    const exploded = await post(base, FORGOT, { email: VALID_BODY.email });
    assert.equal(exploded.status, 202, exploded.text);
    assert.deepEqual(exploded.json, { accepted: true });
    assert.ok(harness.logger.warns.length > 1);
  });
});

// ─── Configuración (T4, contrato completo) ──────────────────────────────────

test('config: el TTL y el límite de forgot-password se respetan desde el harness', async () => {
  const harness = makeHarness({ passwordResetTtlMinutes: 30, forgotThrottleWindowMinutes: 45 });
  await withServer(harness, async (base) => {
    await registerVerified(harness, base);
    const token = await requestResetToken(harness, base);
    const saved = [...harness.repo.passwordResetTokens.values()][0]!;
    assert.equal(saved.expiresAt.getTime(), harness.clock.now.getTime() + 30 * MINUTE_MS);

    // El correo anuncia el TTL configurado (30 minutos, no el default).
    assert.equal(harness.sender.passwordResets[0]!.expiresInMinutes, 30);
    const reset = await post(base, RESET, { token, password: 'clavesNueva9' });
    assert.equal(reset.status, 200, reset.text);
  });
});

test('config: loadEnv resuelve PASSWORD_RESET_TTL_MINUTES y el límite de forgot-password', () => {
  const env = loadEnv({
    PASSWORD_RESET_TTL_MINUTES: '90',
    FORGOT_THROTTLE_MAX: '5',
    FORGOT_THROTTLE_WINDOW_MINUTES: '20',
  });
  assert.equal(env.passwordResetTtlMinutes, 90);
  assert.equal(env.forgotThrottleMax, 5);
  assert.equal(env.forgotThrottleWindowMinutes, 20);
  const fallback = loadEnv({});
  assert.equal(fallback.passwordResetTtlMinutes, 60);
  assert.equal(fallback.forgotThrottleMax, 3);
  assert.equal(fallback.forgotThrottleWindowMinutes, 60);
});
