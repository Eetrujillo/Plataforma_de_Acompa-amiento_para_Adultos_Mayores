import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { compare, getRounds } from 'bcryptjs';

import { buildApp } from '../src/app.ts';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/BcryptPasswordHasher.ts';
import type {
  PasswordHasherPort,
  StoredUser,
  UserRepositoryPort,
} from '../src/modules/auth/application/RegisterCaregiver.ts';
import type { ConsentEvidence, UserEntity } from '../src/modules/auth/domain/User.ts';

const TERMS_VERSION = '9.9-test';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

class InMemoryUserRepository implements UserRepositoryPort {
  readonly users = new Map<string, StoredUser>();
  readonly consents = new Map<string, ConsentEvidence>();
  readonly savedEntities: UserEntity[] = [];
  findByEmailCalls = 0;
  saveCalls = 0;

  async findByEmail(email: string): Promise<StoredUser | null> {
    this.findByEmailCalls += 1;
    return this.users.get(email) ?? null;
  }

  async save(user: UserEntity): Promise<StoredUser> {
    this.saveCalls += 1;
    this.savedEntities.push(user);
    this.consents.set(user.email, user.consent);
    const stored: StoredUser = {
      id: randomUUID(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
    this.users.set(user.email, stored);
    return stored;
  }
}

class FakePasswordHasher implements PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return `$2a$10$fakestoredhashfor${plain}`;
  }
}

interface Harness {
  app: Express;
  repo: InMemoryUserRepository;
  hasher: PasswordHasherPort;
}

function makeHarness(hasher: PasswordHasherPort = new FakePasswordHasher()): Harness {
  const repo = new InMemoryUserRepository();
  const app = buildApp({
    userRepository: repo,
    passwordHasher: hasher,
    clock: () => FIXED_NOW,
    termsVersion: TERMS_VERSION,
  });
  return { app, repo, hasher };
}

async function withServer(harness: Harness, run: (base: string) => Promise<void>): Promise<void> {
  const server = createServer(harness.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

interface PostResult {
  status: number;
  json: unknown;
  text: string;
}

async function post(
  base: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<PostResult> {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

const VALID_BODY = {
  fullName: 'Esteban Trujillo',
  email: 'cuidador@example.com',
  password: 'clave1234',
  acceptedTerms: true,
};

function errorEnvelope(json: unknown): { code: string; message: string; details?: unknown } {
  assert.ok(
    json !== null && typeof json === 'object' && 'error' in json,
    `se esperaba el sobre de error, llegó: ${JSON.stringify(json)}`,
  );
  const error = (json as { error: unknown }).error;
  assert.ok(error !== null && typeof error === 'object' && 'code' in error && 'message' in error);
  const envelope = error as { code: unknown; message: unknown; details?: unknown };
  assert.equal(typeof envelope.code, 'string');
  assert.equal(typeof envelope.message, 'string');
  return { code: envelope.code as string, message: envelope.message as string, details: envelope.details };
}

test('S1: registro válido responde 201 con el usuario creado', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const result = await post(base, VALID_BODY);
    assert.equal(result.status, 201, `cuerpo: ${result.text}`);
    const body = result.json as { user: Record<string, unknown> };
    assert.ok(typeof body.user['id'] === 'string' && body.user['id'].length > 0);
    assert.equal(body.user['email'], 'cuidador@example.com');
    assert.equal(body.user['fullName'], 'Esteban Trujillo');
    assert.equal(body.user['role'], 'CAREGIVER');
    assert.equal(harness.repo.users.size, 1);
  });
});

test('S2: correo con formato inválido responde 400 INVALID_EMAIL y no consulta el repositorio', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const result = await post(base, { ...VALID_BODY, email: 'no-es-un-correo' });
    assert.equal(result.status, 400);
    assert.equal(errorEnvelope(result.json).code, 'INVALID_EMAIL');
    assert.equal(harness.repo.findByEmailCalls, 0);
    assert.equal(harness.repo.saveCalls, 0);
  });
});

test('S3: correo ya registrado responde 400 EMAIL_ALREADY_REGISTERED y no guarda de nuevo', async () => {
  const harness = makeHarness();
  harness.repo.users.set('cuidador@example.com', {
    id: randomUUID(),
    email: 'cuidador@example.com',
    fullName: 'Otra Persona',
    role: 'CAREGIVER',
  });
  await withServer(harness, async (base) => {
    const result = await post(base, VALID_BODY);
    assert.equal(result.status, 400);
    const envelope = errorEnvelope(result.json);
    assert.equal(envelope.code, 'EMAIL_ALREADY_REGISTERED');
    assert.equal(envelope.message, 'Este correo ya tiene una cuenta');
    assert.equal(harness.repo.saveCalls, 0);
    assert.equal(harness.repo.users.size, 1);
  });
});

test('S4: contraseña de menos de 8 caracteres se rechaza con 400 WEAK_PASSWORD; 8 exactos pasan', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const short = await post(base, { ...VALID_BODY, password: 'abc123' });
    assert.equal(short.status, 400);
    assert.equal(errorEnvelope(short.json).code, 'WEAK_PASSWORD');
    assert.equal(harness.repo.findByEmailCalls, 0);
    assert.equal(harness.repo.saveCalls, 0);

    const boundary = await post(base, {
      ...VALID_BODY,
      email: 'otro@example.com',
      password: 'abcdefgh1',
    });
    assert.equal(boundary.status, 201, `cuerpo: ${boundary.text}`);
  });
});

test('S5: sin acceptedTerms true responde 400 TERMS_NOT_ACCEPTED y no escribe nada', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const rejected = await post(base, { ...VALID_BODY, acceptedTerms: false });
    assert.equal(rejected.status, 400);
    assert.equal(errorEnvelope(rejected.json).code, 'TERMS_NOT_ACCEPTED');

    const missing = await post(base, {
      fullName: VALID_BODY.fullName,
      email: 'otro@example.com',
      password: VALID_BODY.password,
    });
    assert.equal(missing.status, 400);
    assert.equal(errorEnvelope(missing.json).code, 'TERMS_NOT_ACCEPTED');

    assert.equal(harness.repo.findByEmailCalls, 0);
    assert.equal(harness.repo.saveCalls, 0);
    assert.equal(harness.repo.users.size, 0);
  });
});

test('S6: el correo se normaliza; Ana@X.com y ana@x.com son la misma cuenta', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const first = await post(base, { ...VALID_BODY, email: 'Ana@X.com' });
    assert.equal(first.status, 201);

    const second = await post(base, { ...VALID_BODY, email: 'ana@x.com' });
    assert.equal(second.status, 400);
    assert.equal(errorEnvelope(second.json).code, 'EMAIL_ALREADY_REGISTERED');

    assert.ok(harness.repo.users.has('ana@x.com'), 'la cuenta quedó con el correo normalizado');
    assert.equal(harness.repo.users.size, 1);
  });
});

test('S7: se persiste solo el hash bcrypt (costo 10); el texto plano no se guarda ni aparece en la respuesta', async () => {
  const harness = makeHarness(new BcryptPasswordHasher());
  await withServer(harness, async (base) => {
    const result = await post(base, VALID_BODY);
    assert.equal(result.status, 201);

    const saved = harness.repo.savedEntities[0];
    assert.ok(saved, 'la entidad fue persistida');
    const storedHash = saved.passwordHash;
    assert.notEqual(storedHash, VALID_BODY.password, 'el texto plano no se guarda');
    assert.equal(getRounds(storedHash), 10);
    assert.ok(
      storedHash.startsWith('$2a$10$') || storedHash.startsWith('$2b$10$'),
      `hash: ${storedHash.slice(0, 8)}`,
    );
    assert.equal(await compare(VALID_BODY.password, storedHash), true);

    assert.ok(!result.text.includes(VALID_BODY.password), 'la respuesta no trae la contraseña');
    assert.ok(!result.text.includes('passwordHash'), 'la respuesta no trae passwordHash');
    assert.ok(!result.text.includes(storedHash), 'la respuesta no trae el hash');
  });
});

test('S8: evidencia de consentimiento Ley 1581: acceptedTermsAt, termsVersion e ipAddress', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    // El header no elige la IP: sin saltos de proxy confiables se ignora
    // (odd/tasks/hu-001-advisory-hardening.md, S1). La evidencia usa el socket.
    const withIp = await post(
      base,
      { ...VALID_BODY, email: 'con-ip@example.com' },
      { 'x-forwarded-for': '203.0.113.9' },
    );
    assert.equal(withIp.status, 201);

    const withoutIp = await post(base, { ...VALID_BODY, email: 'sin-ip@example.com' });
    assert.equal(withoutIp.status, 201);

    const savedWithIp = harness.repo.consents.get('con-ip@example.com');
    const savedWithoutIp = harness.repo.consents.get('sin-ip@example.com');
    assert.ok(savedWithIp);
    assert.ok(savedWithoutIp);
    assert.equal(savedWithIp.acceptedTermsAt.toISOString(), FIXED_NOW.toISOString());
    assert.equal(savedWithIp.termsVersion, TERMS_VERSION);
    assert.equal(savedWithIp.ipAddress, '127.0.0.1');
    assert.equal(savedWithoutIp.acceptedTermsAt.toISOString(), FIXED_NOW.toISOString());
    assert.equal(savedWithoutIp.termsVersion, TERMS_VERSION);
    // Sin proxy, la IP del transporte es la del socket: el pedido siempre trae
    // una IP y la evidencia la registra.
    assert.equal(savedWithoutIp.ipAddress, '127.0.0.1');
  });
});

test('S9: la respuesta no incluye passwordHash ni campos de sesión', async () => {
  const harness = makeHarness();
  await withServer(harness, async (base) => {
    const result = await post(base, VALID_BODY);
    assert.equal(result.status, 201);
    assert.ok(!result.text.includes('passwordHash'));
    assert.ok(!result.text.includes('token'));
    const body = result.json as { user: Record<string, unknown> };
    assert.deepEqual(Object.keys(body.user).sort(), ['email', 'fullName', 'id', 'role']);
  });
});
