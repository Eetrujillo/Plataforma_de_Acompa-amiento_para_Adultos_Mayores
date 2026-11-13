/**
 * Local authentication service (S1) — same calls on web and mobile (S2).
 * All persistence goes through the shared AsyncStorage-backed layer in
 * `src/services/storage.ts` (localStorage on web). Passwords are never
 * stored in plain text: SHA-256 digest with a per-user salt.
 *
 * Next milestone replaces the internals with real API calls behind
 * these same function signatures.
 */

import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import { StorageKeys, loadObject, removeItem, saveObject } from '@/services/storage';

export type Role = 'admin' | 'adulto_mayor' | 'cuidador' | 'familiar';

export const ROLES: readonly Role[] = ['admin', 'adulto_mayor', 'cuidador', 'familiar'];

/** Spanish display labels for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administración',
  adulto_mayor: 'Adulto mayor',
  cuidador: 'Cuidador',
  familiar: 'Familiar',
};

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: 'email-taken' | 'invalid-credentials' | 'input-error'; message: string };

const SALT_PREFIX = 'aam.v1.';

async function hashPassword(password: string, salt: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${SALT_PREFIX}${salt}:${password}`);
}

function publicUser(user: StoredUser): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function validateRegisterInput(name: string, email: string, password: string): string | null {
  if (!name.trim()) return 'Ingresá tu nombre';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'El correo no parece válido';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
  return null;
}

async function listUsers(): Promise<StoredUser[]> {
  return (await loadObject<StoredUser[]>(StorageKeys.users)) ?? [];
}

/** Register a new user in local storage and start their session. */
export async function register(
  name: string,
  email: string,
  password: string,
  role: Role,
): Promise<AuthResult> {
  const inputError = validateRegisterInput(name, email, password);
  if (inputError) return { ok: false, reason: 'input-error', message: inputError };
  if (!ROLES.includes(role)) {
    return { ok: false, reason: 'input-error', message: 'Elegí un rol válido' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const users = await listUsers();
  if (users.some((user) => user.email === normalizedEmail)) {
    return { ok: false, reason: 'email-taken', message: 'Ese correo ya tiene una cuenta' };
  }

  const salt = randomUUID();
  const user: StoredUser = {
    id: randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    role,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveObject(StorageKeys.users, users);
  await saveObject(StorageKeys.session, publicUser(user));
  return { ok: true, user: publicUser(user) };
}

/** Validate credentials against local users and start a session. */
export async function login(email: string, password: string): Promise<AuthResult> {
  if (!email.trim() || !password) {
    return { ok: false, reason: 'input-error', message: 'Completá correo y contraseña' };
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = (await listUsers()).find((candidate) => candidate.email === normalizedEmail);
  // Same message for unknown email and wrong password: no account probing.
  if (!user || (await hashPassword(password, user.salt)) !== user.passwordHash) {
    return { ok: false, reason: 'invalid-credentials', message: 'Correo o contraseña incorrectos' };
  }
  await saveObject(StorageKeys.session, publicUser(user));
  return { ok: true, user: publicUser(user) };
}

/** Drop the current session (data stays in local storage). */
export async function logout(): Promise<void> {
  await removeItem(StorageKeys.session);
}

/** The logged-in user for this browser/device, or null. */
export async function getSession(): Promise<PublicUser | null> {
  return loadObject<PublicUser>(StorageKeys.session);
}

/* ------------------------------------------------------------------ */
/* Demo seed users                                                     */
/* ------------------------------------------------------------------ */

interface DemoUser {
  name: string;
  email: string;
  role: Role;
  password: string;
}

/**
 * Seed accounts, one per role (S4). Idempotent: it upserts each demo user
 * by email, so it runs on every cold start and coexists with real
 * registrations. Demo credentials are public on purpose (local demo data).
 */
export const DEMO_USERS: readonly DemoUser[] = [
  { name: 'Admin AAM (super usuario)', email: 'admin@aam.demo', role: 'admin', password: 'admin123' },
  { name: 'Carlos Prueba', email: 'prueba@aam.demo', role: 'cuidador', password: 'prueba123' },
  { name: 'Don José Pérez', email: 'adulto@aam.demo', role: 'adulto_mayor', password: 'adulto123' },
  { name: 'María Familiar', email: 'familiar@aam.demo', role: 'familiar', password: 'familiar123' },
];

export async function ensureDemoUsers(): Promise<void> {
  const users = await listUsers();
  for (const demo of DEMO_USERS) {
    if (users.some((user) => user.email === demo.email)) continue;
    const salt = randomUUID();
    users.push({
      id: randomUUID(),
      name: demo.name,
      email: demo.email,
      role: demo.role,
      salt,
      passwordHash: await hashPassword(demo.password, salt),
      createdAt: new Date().toISOString(),
    });
  }
  await saveObject(StorageKeys.users, users);
}
