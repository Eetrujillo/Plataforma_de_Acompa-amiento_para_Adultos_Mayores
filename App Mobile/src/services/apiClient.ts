import { STORAGE_KEYS } from '../config';
import { getApiBase } from './apiBase';
import { appEvents } from './events';
import { getCached, removeCached, setCached } from './storage';

/**
 * Cliente HTTP del familiar (rol `familiar`).
 *
 * Es el mismo contrato de la versión web:
 * - Token JWT en `Authorization: Bearer ...`.
 * - `ApiError` con `status`, `code`, `retryAfterSeconds` y `field`, para que la
 *   interfaz pueda resaltar el campo correcto.
 * - Un 401 en una ruta protegida dispara el evento de sesión vencida.
 */

const PUBLIC_AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

/** Evita que una petición se quede colgada en una red móvil inestable. */
const REQUEST_TIMEOUT_MS = 20_000;

interface ApiErrorDetails {
  field?: string;
  retryAfterSeconds?: number;
  consent?: unknown;
  scheduledAt?: string;
}

interface ApiErrorBody {
  /** Forma de `prod_local`: `{ error: { code, message, details } }`. */
  error?: string | { code?: string; message?: string; details?: ApiErrorDetails };
  /** Forma antigua plana. */
  code?: string;
  retryAfterSeconds?: number;
  field?: string;
}

function readErrorBody(body: ApiErrorBody | null): {
  message: string;
  code?: string;
  field?: string;
  retryAfterSeconds?: number;
} {
  if (!body) return { message: '' };

  if (typeof body.error === 'string') {
    return {
      message: body.error,
      code: body.code,
      field: body.field,
      retryAfterSeconds: body.retryAfterSeconds,
    };
  }

  const details = body.error?.details;

  return {
    message: body.error?.message ?? '',
    code: body.error?.code ?? body.code,
    field: details?.field ?? body.field,
    retryAfterSeconds: details?.retryAfterSeconds ?? body.retryAfterSeconds,
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;
  field?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAfterSeconds?: number,
    field?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.field = field;
  }
}

export function getToken(): string | null {
  return getCached(STORAGE_KEYS.authToken);
}

export function setToken(token: string | null): void {
  if (token) setCached(STORAGE_KEYS.authToken, token);
  else removeCached(STORAGE_KEYS.authToken);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const parsed = readErrorBody(errorBody);

    if (
      (response.status === 401 || parsed.code === 'SESSION_INVALIDATED') &&
      token &&
      !PUBLIC_AUTH_PATHS.has(path)
    ) {
      appEvents.emitSessionExpired();
    }

    throw new ApiError(
      parsed.message || `Error ${response.status}`,
      response.status,
      parsed.code,
      parsed.retryAfterSeconds,
      parsed.field
    );
  }

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
