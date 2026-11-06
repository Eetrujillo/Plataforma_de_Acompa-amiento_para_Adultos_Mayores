const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
const TOKEN_KEY = 'gap_auth_token';
const PUBLIC_AUTH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

export const SESSION_EXPIRED_EVENT = 'gap:session-expired';

interface ApiErrorDetails {
  field?: string;
  retryAfterSeconds?: number;
  consent?: unknown;
  scheduledAt?: string;
}

interface ApiErrorBody {
  /** Forma de `prod_local`: `{ error: { code, message, details } }`. */
  error?: string | { code?: string; message?: string; details?: ApiErrorDetails };
  /** Forma antigua plana, se mantiene por compatibilidad. */
  code?: string;
  field?: string;
  retryAfterSeconds?: number;
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
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      0,
      'NETWORK_ERROR'
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const parsed = readErrorBody(body);

    if (
      (response.status === 401 || parsed.code === 'SESSION_INVALIDATED') &&
      token &&
      !PUBLIC_AUTH_PATHS.has(path) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }

    throw new ApiError(
      parsed.message || `Error ${response.status}`,
      response.status,
      parsed.code,
      parsed.retryAfterSeconds,
      parsed.field
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
