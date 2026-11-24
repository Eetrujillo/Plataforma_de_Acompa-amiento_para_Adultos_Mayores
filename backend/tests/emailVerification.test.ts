import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';

import {
  FIXED_NOW,
  VALID_BODY,
  CapturingLogger,
  errorEnvelope,
  makeHarness,
  post,
  withServer,
} from './support/registerHarness.ts';

const REGISTER = '/api/auth/register';
const VERIFY = '/api/auth/verify-email';
const RESEND = '/api/auth/resend-verification';
const HOUR_MS = 3_600_000;

/** Mensaje único de "este token no sirve" (D2, S3): literal del contrato. */
const INVALID_TOKEN_MESSAGE = 'El enlace de verificación no es válido o ya venció';

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}

/**
 * POST con headers crudos: `fetch` prohíbe fijar `Host`; para S5 necesitamos
 * un pedido con `Host` y `X-Forwarded-Host` manipulados.
 */
function postRaw(
  base: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${base}${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8');
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('S1: el registro emite un token único válido 24 horas y envía el correo con el enlace', async () => {
  const harness = makeHarness({ appUrl: 'https://app.ejemplo.test' });
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY);
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as { verificationSent: unknown };
    assert.equal(body.verificationSent, true);

    assert.equal(harness.sender.sent.length, 1);
    const message = harness.sender.sent[0];
    assert.ok(message, 'el registro disparó un correo');
    assert.equal(message.to, 'cuidador@example.com');
    assert.equal(message.fullName, 'Esteban Trujillo');
    assert.equal(message.expiresInHours, 24, 'el correo anuncia el vencimiento de 24 horas');
    assert.ok(
      message.link.startsWith('https://app.ejemplo.test/verify-email?token='),
      `enlace: ${message.link}`,
    );

    // 32 bytes aleatorios en base64url y vencimiento medido con el reloj inyectado.
    const raw = tokenFromLink(message.link);
    assert.equal(raw.length, 43);
    const saved = harness.repo.savedTokens.get('cuidador@example.com');
    assert.ok(saved, 'el token quedó persistido');
    assert.equal(saved.expiresAt.getTime(), FIXED_NOW.getTime() + 24 * HOUR_MS);
  });
});

test('S1: un envío que falla no rompe el registro: 201 con verificationSent false', async () => {
  const harness = makeHarness();
  harness.sender.failNext = true;
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY);
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as { verificationSent: unknown };
    assert.equal(body.verificationSent, false);
    assert.equal(harness.sender.sent.length, 0);
    // El token igual quedó emitido (docs/smtp-setup.md: el usuario puede pedir otro).
    assert.ok(harness.repo.savedTokens.has('cuidador@example.com'));
  });
});

test('S1: una persistencia del token que falla no rompe el registro: 201 con verificationSent false', async () => {
  const harness = makeHarness({ saveTokenError: new Error('mongo caído') });
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY);
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as { verificationSent: unknown };
    assert.equal(body.verificationSent, false);
    assert.equal(harness.sender.sent.length, 0);
  });
});

test('contrato: register mantiene la respuesta de HU-001 y agrega el booleano verificationSent', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY);
    assert.equal(result.status, 201);
    const body = result.json as { user: Record<string, unknown>; verificationSent: unknown };
    assert.deepEqual(Object.keys(body).sort(), ['user', 'verificationSent']);
    assert.equal(typeof body.verificationSent, 'boolean');
    assert.equal(body.verificationSent, true);
    assert.deepEqual(Object.keys(body.user).sort(), ['email', 'fullName', 'id', 'role']);
  });
});

test('S2: verificar con el token del correo marca emailVerifiedAt y responde el usuario verificado', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const registered = await post(base, REGISTER, VALID_BODY);
    assert.equal(registered.status, 201);
    const raw = tokenFromLink(harness.sender.sent[0]!.link);

    const verified = await post(base, VERIFY, { token: raw });
    assert.equal(verified.status, 200, `cuerpo: ${verified.text}`);
    const body = verified.json as { user: Record<string, unknown> };
    assert.deepEqual(Object.keys(body.user).sort(), [
      'email',
      'emailVerified',
      'fullName',
      'id',
      'role',
    ]);
    assert.equal(body.user['email'], 'cuidador@example.com');
    assert.equal(body.user['emailVerified'], true);

    // emailVerifiedAt lo fija el reloj del servidor y el token queda invalidado.
    assert.equal(harness.repo.verifiedAt.get('cuidador@example.com')?.toISOString(), FIXED_NOW.toISOString());
    assert.equal(harness.repo.savedTokens.has('cuidador@example.com'), false);
  });
});

test('S3: vencido, ya usado, inexistente y malformado responden el mismo 400 INVALID_TOKEN, sin details', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    // Dos cuentas registradas con el reloj en t0.
    const first = await post(base, REGISTER, VALID_BODY);
    assert.equal(first.status, 201);
    const usedToken = tokenFromLink(harness.sender.sent[0]!.link);
    const second = await post(base, REGISTER, { ...VALID_BODY, email: 'otro@example.com' });
    assert.equal(second.status, 201);
    const expiredToken = tokenFromLink(harness.sender.sent[1]!.link);

    // Ya usado: se verifica una vez y el segundo intento falla.
    const ok = await post(base, VERIFY, { token: usedToken });
    assert.equal(ok.status, 200);
    const used = await post(base, VERIFY, { token: usedToken });

    // Vencido: pasadas las 24 horas el segundo token ya no sirve.
    harness.clock.now = new Date(FIXED_NOW.getTime() + 24 * HOUR_MS + 1);
    const expired = await post(base, VERIFY, { token: expiredToken });

    // Inexistente y malformado.
    const unknown = await post(base, VERIFY, { token: 'a'.repeat(43) });
    const malformed = await post(base, VERIFY, { token: 'abc' });

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
      const envelope = errorEnvelope(result.json);
      assert.equal(envelope.code, 'INVALID_TOKEN', name);
      assert.equal(envelope.message, INVALID_TOKEN_MESSAGE, name);
      assert.equal(envelope.details, undefined, `${name} no delata cuál fue el motivo`);
      assert.equal(result.text, expected, `${name} responde idéntico a los otros casos`);
    }
  });
});

test('contrato: verify-email sin token o con token no textual responde 400 INVALID_BODY', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const missing = await post(base, VERIFY, {});
    assert.equal(missing.status, 400);
    assert.equal(errorEnvelope(missing.json).code, 'INVALID_BODY');

    const notText = await post(base, VERIFY, { token: 42 });
    assert.equal(notText.status, 400);
    assert.equal(errorEnvelope(notText.json).code, 'INVALID_BODY');

    assert.equal(harness.repo.stateLookups, 0, 'un cuerpo inválido no consulta nada');
  });
});

test('S5: el enlace se arma con APP_URL; un Host o X-Forwarded-Host distinto no lo cambia', async () => {
  const harness = makeHarness({ appUrl: 'https://app.ejemplo.test' });
  await withServer(harness, async (base) => {
    const result = await postRaw(base, REGISTER, VALID_BODY, {
      host: 'malicious.example',
      'x-forwarded-host': 'attacker.example',
    });
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);

    assert.equal(harness.sender.sent.length, 1);
    const link = harness.sender.sent[0]!.link;
    assert.ok(link.startsWith('https://app.ejemplo.test/verify-email?token='), `enlace: ${link}`);
    assert.ok(!link.includes('malicious.example'));
    assert.ok(!link.includes('attacker.example'));
  });
});

test('S6: la base guarda sólo sha256(token); el token crudo no aparece en ninguna respuesta', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const registered = await post(base, REGISTER, VALID_BODY);
    assert.equal(registered.status, 201);
    const raw = tokenFromLink(harness.sender.sent[0]!.link);

    const saved = harness.repo.savedTokens.get('cuidador@example.com');
    assert.ok(saved);
    assert.equal(
      saved.tokenHash,
      createHash('sha256').update(raw, 'utf8').digest('hex'),
      'lo persistido es el SHA-256 del token en claro',
    );
    assert.match(saved.tokenHash, /^[0-9a-f]{64}$/);
    assert.notEqual(saved.tokenHash, raw);

    // Ninguna respuesta HTTP contiene el token crudo: registro, reenvío ni verificación.
    assert.ok(!registered.text.includes(raw));
    const resent = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(resent.status, 202);
    assert.ok(!resent.text.includes(raw));
    // El reenvío pisó el token (S8): el vigente es el último emitido.
    const newRaw = tokenFromLink(harness.sender.sent[1]!.link);
    assert.ok(!resent.text.includes(newRaw));
    const verified = await post(base, VERIFY, { token: newRaw });
    assert.equal(verified.status, 200, `cuerpo: ${verified.text}`);
    assert.ok(!verified.text.includes(newRaw));
    assert.ok(!verified.text.includes(raw));
  });
});

test('S6 (canal console): sin SMTP_HOST el enlace se imprime en el log con la frase "Enlace de verificación"', async () => {
  const { createEmailSender } = await import('../src/modules/auth/infrastructure/EmailSender.ts');
  const logger = new CapturingLogger();
  const sender = createEmailSender(
    { host: null, port: 587, secure: false, user: null, pass: null, from: 'Plataforma <no-reply@example.com>' },
    logger,
  );
  const result = await sender.sendVerificationEmail({
    to: 'cuidador@example.com',
    fullName: 'Esteban Trujillo',
    link: 'https://app.ejemplo.test/verify-email?token=abc',
    expiresInHours: 24,
  });
  assert.deepEqual(result, { delivered: true, channel: 'console' });
  const logged = logger.infos.find((line) => line.includes('Enlace de verificación'));
  assert.ok(logged, `el log incluye la frase de la guía operativa: ${JSON.stringify(logger.infos)}`);
  assert.ok(logged.includes('https://app.ejemplo.test/verify-email?token=abc'));
});

test('C2: dos canjes del mismo token no pueden dar dos 200: el perdedor responde INVALID_TOKEN', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const registered = await post(base, REGISTER, VALID_BODY);
    assert.equal(registered.status, 201);
    const raw = tokenFromLink(harness.sender.sent[0]!.link);

    // Dos pedidos simultáneos del mismo token: ambos superan la búsqueda y sólo
    // uno gana el canje atómico; el otro responde el INVALID_TOKEN único (S3).
    const [first, second] = await Promise.all([
      post(base, VERIFY, { token: raw }),
      post(base, VERIFY, { token: raw }),
    ]);
    assert.deepEqual(
      [first.status, second.status].sort(),
      [200, 400],
      `uno: ${first.text} · otro: ${second.text}`,
    );
    const winner = first.status === 200 ? first : second;
    const body = winner.json as { user: { email: unknown; emailVerified: unknown } };
    assert.equal(body.user.email, 'cuidador@example.com');
    assert.equal(body.user.emailVerified, true);

    // La cuenta queda verificada exactamente una vez, con el reloj del servidor.
    assert.equal(
      harness.repo.verifiedAt.get('cuidador@example.com')?.toISOString(),
      FIXED_NOW.toISOString(),
    );
  });
});

test('S8: un reenvío válido invalida el token anterior; el nuevo funciona', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const registered = await post(base, REGISTER, VALID_BODY);
    assert.equal(registered.status, 201);
    const oldToken = tokenFromLink(harness.sender.sent[0]!.link);

    const resent = await post(base, RESEND, { email: VALID_BODY.email });
    assert.equal(resent.status, 202, `cuerpo: ${resent.text}`);
    assert.deepEqual(resent.json, { accepted: true });
    assert.equal(harness.sender.sent.length, 2);
    const newToken = tokenFromLink(harness.sender.sent[1]!.link);
    assert.notEqual(newToken, oldToken, 'el reenvío emite un token nuevo');

    const oldLink = await post(base, VERIFY, { token: oldToken });
    assert.equal(oldLink.status, 400);
    const envelope = errorEnvelope(oldLink.json);
    assert.equal(envelope.code, 'INVALID_TOKEN');
    assert.equal(envelope.message, INVALID_TOKEN_MESSAGE);

    const newLink = await post(base, VERIFY, { token: newToken });
    assert.equal(newLink.status, 200, `cuerpo: ${newLink.text}`);
  });
});
