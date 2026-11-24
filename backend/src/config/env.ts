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
  /** Solo en producción: el backend no arranca sin JWT_SECRET (jwt-security). */
  jwtSecret: string | null;
  /** APP_URL: base del enlace de verificación (S5). */
  appUrl: string;
  /** EMAIL_VERIFICATION_TTL_HOURS: vigencia del token de verificación (S1). */
  emailVerificationTtlHours: number;
  /** RESEND_THROTTLE_MAX / RESEND_THROTTLE_WINDOW_MINUTES (S4). */
  resendThrottleMax: number;
  resendThrottleWindowMinutes: number;
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

function readBool(source: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const raw = source[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
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
    emailVerificationTtlHours: readInt(source, 'EMAIL_VERIFICATION_TTL_HOURS', 24),
    resendThrottleMax: readPositiveInt(source, 'RESEND_THROTTLE_MAX', 3),
    resendThrottleWindowMinutes: readPositiveInt(source, 'RESEND_THROTTLE_WINDOW_MINUTES', 60),
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
