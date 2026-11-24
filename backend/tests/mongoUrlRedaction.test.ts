import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redactConnectionStrings, redactMongoUrl } from '../src/config/redactMongoUrl.ts';

test('S4: la contraseña y el usuario de MONGO_URL no llegan al log', () => {
  const redacted = redactMongoUrl('mongodb://victor:sup3r-s3cret@mongo.example.com:27017/mearn_db?directConnection=true');
  assert.ok(!redacted.includes('sup3r-s3cret'), `se filtró la contraseña: ${redacted}`);
  assert.ok(!redacted.includes('victor'), `se filtró el usuario: ${redacted}`);
  assert.ok(redacted.includes('***'), `falta la marca de redacción: ${redacted}`);
  assert.ok(redacted.includes('mongo.example.com:27017'), `perdió el host: ${redacted}`);
  assert.ok(redacted.includes('/mearn_db'), `perdió la base: ${redacted}`);
  assert.ok(redacted.includes('directConnection=true'), `perdió la query: ${redacted}`);
});

test('S4: una URL sin credenciales se loguea tal cual', () => {
  assert.equal(
    redactMongoUrl('mongodb://localhost:4301/mearn_db?directConnection=true'),
    'mongodb://localhost:4301/mearn_db?directConnection=true',
  );
});

test('S4: también redacta mongodb+srv y contraseñas con caracteres escapados', () => {
  const srv = redactMongoUrl('mongodb+srv://app:p%40ss%3Aword@cluster0.mongodb.net/prod?retryWrites=true&w=majority');
  assert.ok(!srv.includes('p%40ss%3Aword'), `se filtró la contraseña: ${srv}`);
  assert.ok(!srv.includes('app:'), `se filtró el usuario: ${srv}`);
  assert.ok(srv.includes('cluster0.mongodb.net'), `perdió el host: ${srv}`);
  assert.ok(srv.startsWith('mongodb+srv://'), `perdió el esquema: ${srv}`);
});

test('S4: multi-host, IPv6, socket y usuario sin contraseña conservan el host y pierden el secreto', () => {
  const cases: Array<[string, string]> = [
    ['mongodb://app:SuperSecret1@host1:27017,host2:27017/db?replicaSet=rs0', 'host1:27017,host2:27017'],
    ['mongodb://app:SuperSecret1@[::1]:27017/db', '[::1]:27017'],
    ['mongodb://app:SuperSecret1@%2Ftmp%2Fmongodb-27017.sock/db', '%2Ftmp%2Fmongodb-27017.sock'],
    ['mongodb://app@host:27017/db', 'host:27017'],
  ];
  for (const [url, host] of cases) {
    const out = redactMongoUrl(url);
    assert.ok(!out.includes('SuperSecret1') && !out.includes('app'), `se filtró el secreto en ${url}: ${out}`);
    assert.ok(out.includes(host), `perdió el host en ${url}: ${out}`);
  }
});

test('S4: un texto de error con la URI de conexión se scrubea antes de loguearse', () => {
  const message =
    'MongoParseError: Protocol and host list are required in "mongodb://app:SuperSecret1@/db"';
  const scrubbed = redactConnectionStrings(message);
  assert.ok(!scrubbed.includes('SuperSecret1'), `se filtró la contraseña: ${scrubbed}`);
  assert.ok(!scrubbed.includes('app:'), `se filtró el usuario: ${scrubbed}`);
  assert.ok(scrubbed.includes('MongoParseError'), `se perdió el diagnóstico: ${scrubbed}`);
  assert.ok(scrubbed.includes('Protocol and host list'), `se perdió el diagnóstico: ${scrubbed}`);
});
