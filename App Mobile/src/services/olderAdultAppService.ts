import { STORAGE_KEYS } from '../config';
import { getApiBase } from './apiBase';
import { isOnline } from './connectivity';
import { getCached, readJson, removeCached, setCached, writeJson } from './storage';
import type {
  AcceptConsentResponse,
  AppActivitiesResponse,
  AppCompleteActivityResponse,
  ConsentResponse,
  ConsentState,
  ConsentText,
  OlderAdultSessionResponse,
  RedeemLinkingCodePayload,
  RedeemLinkingCodeResponse,
} from '../types';

/**
 * Cliente de la app del adulto mayor.
 *
 * Usa `X-Older-Adult-Token` en lugar de `Bearer` (contrato del backend) y
 * guarda en el dispositivo:
 * - el token de sesión,
 * - el texto del consentimiento (para leerlo sin conexión),
 * - la última rutina (para mostrar actividades sin conexión),
 * - la cola de marcas pendientes (HU-019, en `completionQueue.ts`).
 */

const REQUEST_TIMEOUT_MS = 20_000;

interface AppApiErrorDetails {
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  consent?: ConsentState;
  field?: string;
}

interface ApiErrorBody {
  /** Forma de `prod_local`: `{ error: { code, message, details } }`. */
  error?: string | { code?: string; message?: string; details?: AppApiErrorDetails };
  /** Forma antigua plana. */
  code?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  consent?: ConsentState;
}

function readAppErrorBody(body: ApiErrorBody | null): {
  message: string;
  code?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  consent?: ConsentState;
} {
  if (!body) return { message: '' };

  if (typeof body.error === 'string') {
    return {
      message: body.error,
      code: body.code,
      retryAfterSeconds: body.retryAfterSeconds,
      attemptsRemaining: body.attemptsRemaining,
      consent: body.consent,
    };
  }

  const details = body.error?.details;

  return {
    message: body.error?.message ?? '',
    code: body.error?.code ?? body.code,
    retryAfterSeconds: details?.retryAfterSeconds ?? body.retryAfterSeconds,
    attemptsRemaining: details?.attemptsRemaining ?? body.attemptsRemaining,
    consent: details?.consent ?? body.consent,
  };
}

export class AppApiError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  consent?: ConsentState;
  offline: boolean;

  constructor(
    message: string,
    status: number,
    code?: string,
    options: {
      retryAfterSeconds?: number;
      attemptsRemaining?: number;
      consent?: ConsentState;
      offline?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'AppApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.attemptsRemaining = options.attemptsRemaining;
    this.consent = options.consent;
    this.offline = options.offline === true;
  }
}

export interface CachedRoutine {
  savedAt: string;
  data: AppActivitiesResponse;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string;
}

async function request<T>(
  path: string,
  { method = 'GET', body, token }: RequestOptions = {}
): Promise<T> {
  if (!isOnline()) {
    throw new AppApiError(
      'Necesitas conexión a internet para vincular.',
      0,
      'OFFLINE',
      { offline: true }
    );
  }

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Older-Adult-Token'] = token;

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
    throw new AppApiError(
      'Necesitas conexión a internet para vincular.',
      0,
      'OFFLINE',
      { offline: true }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
    const parsed = readAppErrorBody(errorBody);

    throw new AppApiError(parsed.message || `Error ${response.status}`, response.status, parsed.code, {
      retryAfterSeconds: parsed.retryAfterSeconds,
      attemptsRemaining: parsed.attemptsRemaining,
      consent: parsed.consent,
    });
  }

  return (await response.json()) as T;
}

export const olderAdultAppService = {
  getToken(): string | null {
    return getCached(STORAGE_KEYS.seniorToken);
  },

  setToken(token: string): void {
    setCached(STORAGE_KEYS.seniorToken, token);
  },

  clearToken(): void {
    removeCached(STORAGE_KEYS.seniorToken);
  },

  hasToken(): boolean {
    return Boolean(olderAdultAppService.getToken());
  },

  getConsent(): Promise<ConsentResponse> {
    return request<ConsentResponse>('/app/consent');
  },

  redeem(payload: RedeemLinkingCodePayload): Promise<RedeemLinkingCodeResponse> {
    return request<RedeemLinkingCodeResponse>('/linking/redeem', {
      method: 'POST',
      body: payload,
    });
  },

  session(token = olderAdultAppService.getToken() ?? ''): Promise<OlderAdultSessionResponse> {
    return request<OlderAdultSessionResponse>('/app/session', { token });
  },

  activities(
    date?: string,
    token = olderAdultAppService.getToken() ?? ''
  ): Promise<AppActivitiesResponse> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<AppActivitiesResponse>(`/app/activities${query}`, { token });
  },

  completeActivity(
    id: string,
    date: string,
    completedAt?: string,
    token = olderAdultAppService.getToken() ?? ''
  ): Promise<AppCompleteActivityResponse> {
    return request<AppCompleteActivityResponse>(`/app/activities/${id}/complete`, {
      method: 'POST',
      body: completedAt ? { date, completedAt } : { date },
      token,
    });
  },

  undoCompleteActivity(
    id: string,
    date: string,
    token = olderAdultAppService.getToken() ?? ''
  ): Promise<{ message: string }> {
    return request<{ message: string }>(
      `/app/activities/${id}/complete?date=${encodeURIComponent(date)}`,
      { method: 'DELETE', token }
    );
  },

  acceptConsent(
    consentVersion: string,
    accepted: boolean,
    token = olderAdultAppService.getToken() ?? ''
  ): Promise<AcceptConsentResponse> {
    return request<AcceptConsentResponse>('/app/consent', {
      method: 'POST',
      body: { consentVersion, accepted },
      token,
    });
  },

  logout(pin: string, token = olderAdultAppService.getToken() ?? ''): Promise<{ message: string }> {
    return request<{ message: string }>('/app/logout', {
      method: 'POST',
      body: { pin },
      token,
    });
  },

  saveConsentCache(consent: ConsentText): void {
    writeJson(STORAGE_KEYS.seniorConsent, consent);
  },

  readConsentCache(): ConsentText | null {
    return readJson<ConsentText>(STORAGE_KEYS.seniorConsent);
  },

  saveRoutineCache(data: AppActivitiesResponse): void {
    const cache: CachedRoutine = { savedAt: new Date().toISOString(), data };
    writeJson(STORAGE_KEYS.seniorRoutine, cache);
  },

  readRoutineCache(): CachedRoutine | null {
    return readJson<CachedRoutine>(STORAGE_KEYS.seniorRoutine);
  },

  clearRoutineCache(): void {
    removeCached(STORAGE_KEYS.seniorRoutine);
  },

  clearAll(): void {
    olderAdultAppService.clearToken();
    olderAdultAppService.clearRoutineCache();
    removeCached(STORAGE_KEYS.pendingCompletions);
  },
};
