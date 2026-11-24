import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadEnv } from '../src/config/env.ts';
import { FIXED_NOW, VALID_BODY, makeHarness, post, withServer } from './support/registerHarness.ts';

const REGISTER = '/api/auth/register';
const CLIENT_IP = '203.0.113.9';

test('S1: sin proxies confiables el header X-Forwarded-For no elige la IP de la evidencia', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY, { 'x-forwarded-for': CLIENT_IP });
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);

    const consent = harness.repo.consents.get(VALID_BODY.email);
    assert.ok(consent, 'la evidencia de consentimiento se guardó');
    assert.notEqual(consent.ipAddress, CLIENT_IP, 'el cliente eligió la IP: proxy confiable de más');
    // Sin saltos confiables, la única IP verdadera es la del socket.
    assert.equal(consent.ipAddress, '127.0.0.1');
    assert.equal(consent.acceptedTermsAt.toISOString(), FIXED_NOW.toISOString());
  });
});

test('S1: hops=0 ignora cualquier forma del header, incluso cadenas de proxies', async () => {
  for (const forwarded of [CLIENT_IP, `${CLIENT_IP}, 198.51.100.7`, `${CLIENT_IP}, 198.51.100.7, 192.0.2.5`, '']) {
    const harness = makeHarness();
    await withServer(harness, async (base) => {
      const result = await post(base, REGISTER, VALID_BODY, { 'x-forwarded-for': forwarded });
      assert.equal(result.status, 201, `cuerpo: ${result.text}`);
      assert.equal(
        harness.repo.consents.get(VALID_BODY.email)?.ipAddress,
        '127.0.0.1',
        `X-Forwarded-For: ${forwarded}`,
      );
    });
  }
});

test('S2: con un salto confiable X-Forwarded-For sí define la IP registrada', async () => {
  const harness = makeHarness({ app: { trustProxyHops: 1 } });
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY, { 'x-forwarded-for': CLIENT_IP });
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);

    const consent = harness.repo.consents.get(VALID_BODY.email);
    assert.ok(consent, 'la evidencia de consentimiento se guardó');
    assert.equal(consent.ipAddress, CLIENT_IP);
  });
});

test('S2: req.ip es la (saltos+1)-ésima dirección contada desde el socket', async () => {
  const cases: Array<[number, string, string]> = [
    [1, `${CLIENT_IP}, 198.51.100.7`, '198.51.100.7'],
    [2, `${CLIENT_IP}, 198.51.100.7`, CLIENT_IP],
    [2, `${CLIENT_IP}, 198.51.100.7, 192.0.2.5`, '198.51.100.7'],
  ];
  for (const [hops, forwarded, expected] of cases) {
    const harness = makeHarness({ app: { trustProxyHops: hops } });
    await withServer(harness, async (base) => {
      const result = await post(base, REGISTER, VALID_BODY, { 'x-forwarded-for': forwarded });
      assert.equal(result.status, 201, `cuerpo: ${result.text}`);
      assert.equal(
        harness.repo.consents.get(VALID_BODY.email)?.ipAddress,
        expected,
        `hops=${hops} X-Forwarded-For=${forwarded}`,
      );
    });
  }
});

test('S2: un X-Forwarded-For que no es una IP no se guarda como evidencia', async () => {
  const harness = makeHarness({ app: { trustProxyHops: 1 } });
  await withServer(harness, async (base) => {
    const result = await post(base, REGISTER, VALID_BODY, { 'x-forwarded-for': 'not-an-ip' });
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);

    const consent = harness.repo.consents.get(VALID_BODY.email);
    assert.ok(consent, 'la evidencia de consentimiento se guardó');
    assert.equal(consent.ipAddress, undefined, `se guardó basura como IP: ${consent.ipAddress}`);
  });
});

test('S2: TRUST_PROXY_HOPS se parsea estricto; vacío, negativo o malformado cae a 0 (fail closed)', () => {
  assert.equal(loadEnv({}).trustProxyHops, 0);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '' }).trustProxyHops, 0);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '   ' }).trustProxyHops, 0);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '2' }).trustProxyHops, 2);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: ' 2 ' }).trustProxyHops, 2);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '0' }).trustProxyHops, 0);
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '-1' }).trustProxyHops, 0);
  // Prefijo numérico no alcanza: un typo no puede declarar saltos de más.
  for (const malformed of ['dos', '1.9', '10abc', '1e2', '0x10', '999999999999999999999', '+2']) {
    assert.equal(loadEnv({ TRUST_PROXY_HOPS: malformed }).trustProxyHops, 0, `TRUST_PROXY_HOPS=${malformed}`);
  }
  // Una cadena de proxies absurda también es configuración inválida.
  assert.equal(loadEnv({ TRUST_PROXY_HOPS: '11' }).trustProxyHops, 0);
});
