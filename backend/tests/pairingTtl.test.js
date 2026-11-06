'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * HU-006 S1: la vigencia del código por defecto es 24 horas (1440 minutos), configurable con
 * `PAIRING_TTL_MINUTES`. Se carga el módulo de configuración con un `.env` vacío para que el
 * default del código sea lo único que se lea, sin depender del entorno de quien corre la suite.
 */

const ENV_MODULE = require.resolve('../src/config/env');

function ttlMinutesWith(rawValue) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pairing-ttl-'));
  const envFile = path.join(directory, 'empty.env');
  fs.writeFileSync(envFile, '');

  const previousEnvFile = process.env.ENV_FILE;
  const previousTtl = process.env.PAIRING_TTL_MINUTES;

  try {
    process.env.ENV_FILE = envFile;

    if (rawValue === undefined) {
      delete process.env.PAIRING_TTL_MINUTES;
    } else {
      process.env.PAIRING_TTL_MINUTES = rawValue;
    }

    delete require.cache[ENV_MODULE];

    return require(ENV_MODULE).pairing.ttlMinutes;
  } finally {
    if (previousEnvFile === undefined) delete process.env.ENV_FILE;
    else process.env.ENV_FILE = previousEnvFile;

    if (previousTtl === undefined) delete process.env.PAIRING_TTL_MINUTES;
    else process.env.PAIRING_TTL_MINUTES = previousTtl;

    delete require.cache[ENV_MODULE];
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('S1: the pairing code lives 24 hours by default', () => {
  assert.equal(ttlMinutesWith(undefined), 1440);
});

test('S1: PAIRING_TTL_MINUTES overrides it, and a malformed value falls back to 24 hours', () => {
  assert.equal(ttlMinutesWith('60'), 60);

  for (const malformed of ['abc', '0', '-5', '']) {
    assert.equal(ttlMinutesWith(malformed), 1440, `value ${JSON.stringify(malformed)}`);
  }
});
