/**
 * Configuración de runtime. Los nombres de variables son los ya decididos en
 * `backend/env.sample` y `env.sample`. Un valor malformado cae al default.
 */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  mongoUrl: string;
  termsVersion: string;
  /** Solo en producción: el backend no arranca sin JWT_SECRET (jwt-security). */
  jwtSecret: string | null;
}

function readInt(source: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = source[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return {
    nodeEnv: readString(source, 'NODE_ENV', 'development'),
    port: readInt(source, 'PORT', 3500),
    mongoUrl: source['MONGO_URL']?.trim() ?? 'mongodb://localhost:4301/mearn_db?directConnection=true',
    termsVersion: readString(source, 'TERMS_VERSION', '1.0'),
    jwtSecret: resolveJwtSecret(source),
  };
}
