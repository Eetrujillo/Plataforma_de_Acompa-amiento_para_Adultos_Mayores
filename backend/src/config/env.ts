/**
 * Configuración de runtime. Los nombres de variables son los ya decididos en
 * `backend/env.sample` y `env.sample`. Un valor malformado cae al default.
 */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  mongoUrl: string;
  termsVersion: string;
  /**
   * Saltos de proxy confiables delante del backend. `0` no confía en ninguno:
   * `X-Forwarded-For` de un cliente directo se ignora. Producción declara el
   * número real de proxies (nginx, Cloudflare) en `TRUST_PROXY_HOPS`.
   */
  trustProxyHops: number;
  /**
   * JWT_SECRET. Obligatorio en producción: el backend no arranca sin él
   * (jwt-security). En desarrollo el valor ausente es `null`, fail closed: el
   * módulo auth igual se niega a componerse — un backend de desarrollo sin
   * JWT_SECRET tampoco sirve login ni registro (C4).
   */
  jwtSecret: string | null;
  /** APP_URL: base del enlace de verificación (S5). */
  appUrl: string;
  /** EMAIL_VERIFICATION_TTL_HOURS: vigencia del token de verificación (S1). */
  emailVerificationTtlHours: number;
  /** RESEND_THROTTLE_MAX / RESEND_THROTTLE_WINDOW_MINUTES (S4). */
  resendThrottleMax: number;
  resendThrottleWindowMinutes: number;
  /** HU-004: enlace de restablecimiento (S2) y límite propio de forgot-password (S9). */
  passwordResetTtlMinutes: number;
  /** HU-008: vigencia del QR de vinculación (S14, D7). Default: 24 horas. */
  pairingTtlMinutes: number;
  forgotThrottleMax: number;
  forgotThrottleWindowMinutes: number;
  /** JWT_EXPIRES_IN: vigencia del token de sesión (login). */
  jwtExpiresIn: string;
  /** HU-003: bloqueo de cuenta (S3) y límite por IP del login (S9). */
  lockoutMaxAttempts: number;
  lockoutMinutes: number;
  loginIpMaxAttempts: number;
  loginIpWindowMinutes: number;
  /** SMTP para el correo de verificación; sin host el canal es console (D4). */
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    pass: string | null;
    from: string;
  };
}

function readInt(source: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = source[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Enteros positivos únicamente (C3): un límite de tasa no se puede desactivar
 * por configuración accidental — vacío, `0`, negativo, decimal, prefijo
 * numérico o malformado cae al default, igual que `TRUST_PROXY_HOPS`.
 */
function readPositiveInt(
  source: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = source[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return parsed <= 0 ? fallback : parsed;
}

/** Una cadena de proxies más larga que esto es configuración inválida, no un caso de uso. */
const MAX_TRUSTED_PROXY_HOPS = 10;

/**
 * Saltos de proxy: sólo dígitos, entre 0 y MAX_TRUSTED_PROXY_HOPS. Vacío,
 * negativo, decimal, prefijo numérico de un typo o fuera de rango cae a 0 (fail
 * closed): es preferible una IP fija del proxy a una IP elegida por el cliente.
 */
function readHopCount(source: Record<string, string | undefined>, key: string): number {
  const raw = source[key]?.trim();
  if (raw === undefined || raw === '') return 0;
  if (!/^\d+$/.test(raw)) return 0;
  const parsed = Number.parseInt(raw, 10);
  return parsed > MAX_TRUSTED_PROXY_HOPS ? 0 : parsed;
}

function readString(
  source: Record<string, string | undefined>,
  key: string,
  fallback: string,
): string {
  const raw = source[key];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

export function resolveJwtSecret(source: Record<string, string | undefined>): string | null {
  const secret = source['JWT_SECRET']?.trim();
  const nodeEnv = readString(source, 'NODE_ENV', 'development');
  if (nodeEnv === 'production') {
    if (secret === undefined || secret === '') {
      throw new Error('JWT_SECRET es obligatorio en producción: el backend no arranca sin él.');
    }
    return secret;
  }
  return secret === undefined || secret === '' ? null : secret;
}

/** Duraciones aceptadas por JWT_EXPIRES_IN: dígitos seguidos de s, m, h o d. */
const JWT_DURATION_PATTERN = /^\d+[smhd]$/;
const JWT_DEFAULT_EXPIRES_IN = '7d';

/**
 * C3: `JWT_EXPIRES_IN` se valida contra `^\d+[smhd]$`. Un valor malformado
 * antes se lo tragaba `readString` y jsonwebtoken reventaba al firmar, así que
 * TODO login respondía 500. Cualquier otra cosa — vacío, sólo el número
 * (`7`), o una duración nula como `0d`/`0h`/`0m`/`0s`, un token que vence al
 * instante, degenerado igual que un límite de tasa `0` — cae al default `7d`.
 */
function readJwtDuration(source: Record<string, string | undefined>, key: string): string {
  const raw = source[key]?.trim();
  if (raw === undefined || raw === '') return JWT_DEFAULT_EXPIRES_IN;
  if (!JWT_DURATION_PATTERN.test(raw)) return JWT_DEFAULT_EXPIRES_IN;
  return Number.parseInt(raw, 10) > 0 ? raw : JWT_DEFAULT_EXPIRES_IN;
}

/**
 * C1 (S9): con el default `TRUST_PROXY_HOPS=0` el backend no confía en ningún
 * proxy; detrás de nginx o Cloudflare todos los pedidos traen la IP del proxy y
 * el límite por IP del login — pensado para acotar cada cliente — se vuelve UNA
 * SOLA BOLSA GLOBAL. En producción eso es una decisión de disponibilidad: el
 * arranque avisa fuerte, pero parar el proceso (o no) la decide el humano que
 * hace el deploy — la función sólo devuelve el texto del aviso.
 */
export function globalLoginIpBucketWarning(nodeEnv: string, trustProxyHops: number): string | null {
  if (nodeEnv !== 'production' || trustProxyHops !== 0) return null;
  return (
    'TRUST_PROXY_HOPS=0 en producción: no hay ningún proxy de confianza declarado, así que ' +
    'todos los clientes comparten UNA SOLA BOLSA del límite por IP del login — 20 fallos de ' +
    'cualquier persona (LOGIN_IP_MAX_ATTEMPTS, default 20) bloquean el login de todo el mundo ' +
    'durante la ventana de 15 minutos. Declará el número real de proxies delante del backend.'
  );
}

function readBool(source: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const raw = source[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

/** Valor opcional: vacío o ausente devuelve null (p. ej. SMTP_HOST sin configurar). */
function readOptionalString(
  source: Record<string, string | undefined>,
  key: string,
): string | null {
  const raw = source[key]?.trim();
  return raw === undefined || raw === '' ? null : raw;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return {
    nodeEnv: readString(source, 'NODE_ENV', 'development'),
    port: readInt(source, 'PORT', 3500),
    mongoUrl: source['MONGO_URL']?.trim() ?? 'mongodb://localhost:4301/mearn_db?directConnection=true',
    termsVersion: readString(source, 'TERMS_VERSION', '1.0'),
    trustProxyHops: readHopCount(source, 'TRUST_PROXY_HOPS'),
    jwtSecret: resolveJwtSecret(source),
    appUrl: readString(source, 'APP_URL', 'http://localhost:3500'),
    emailVerificationTtlHours: readPositiveInt(source, 'EMAIL_VERIFICATION_TTL_HOURS', 24),
    resendThrottleMax: readPositiveInt(source, 'RESEND_THROTTLE_MAX', 3),
    resendThrottleWindowMinutes: readPositiveInt(source, 'RESEND_THROTTLE_WINDOW_MINUTES', 60),
    // HU-004: el default del criterio de aceptación es 60 minutos (S2).
    passwordResetTtlMinutes: readPositiveInt(source, 'PASSWORD_RESET_TTL_MINUTES', 60),
    // HU-008: 24 horas por defecto (S14), la constante del dominio es el default (D7).
    pairingTtlMinutes: readPositiveInt(source, 'PAIRING_TTL_MINUTES', 1440),
    forgotThrottleMax: readPositiveInt(source, 'FORGOT_THROTTLE_MAX', 3),
    forgotThrottleWindowMinutes: readPositiveInt(source, 'FORGOT_THROTTLE_WINDOW_MINUTES', 60),
    jwtExpiresIn: readJwtDuration(source, 'JWT_EXPIRES_IN'),
    lockoutMaxAttempts: readPositiveInt(source, 'LOCKOUT_MAX_ATTEMPTS', 5),
    lockoutMinutes: readPositiveInt(source, 'LOCKOUT_MINUTES', 15),
    loginIpMaxAttempts: readPositiveInt(source, 'LOGIN_IP_MAX_ATTEMPTS', 20),
    loginIpWindowMinutes: readPositiveInt(source, 'LOGIN_IP_WINDOW_MINUTES', 15),
    smtp: {
      host: readOptionalString(source, 'SMTP_HOST'),
      port: readInt(source, 'SMTP_PORT', 587),
      secure: readBool(source, 'SMTP_SECURE', false),
      user: readOptionalString(source, 'SMTP_USER'),
      pass: readOptionalString(source, 'SMTP_PASS'),
      from: readString(source, 'SMTP_FROM', 'Plataforma de Acompañamiento <no-reply@example.com>'),
    },
  };
}
