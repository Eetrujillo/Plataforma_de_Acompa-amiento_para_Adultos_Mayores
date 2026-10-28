import type {
  AcceptConsentResponse,
  AppActivitiesResponse,
  ConsentResponse,
  ConsentState,
  ConsentText,
  OlderAdultSessionResponse,
  RedeemLinkingCodePayload,
  RedeemLinkingCodeResponse,
} from '../types';

const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '/api').replace(
  /\/$/,
  ''
);
const TOKEN_KEY = 'gap_older_adult_token';
const CONSENT_CACHE_KEY = 'gap_older_adult_consent';
const ROUTINE_CACHE_KEY = 'gap_older_adult_routine';

interface ApiErrorBody {
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
  consent?: ConsentState;
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

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export interface CachedRoutine {
  savedAt: string;
  data: AppActivitiesResponse;
}

async function request<T>(
  path: string,
  {
    method = 'GET',
    body,
    token,
  }: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    token?: string;
  } = {}
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppApiError(
      'Necesitas conexión a internet para vincular.',
      0,
      'OFFLINE',
      { offline: true }
    );
  }

  const headers = new Headers();

  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('X-Older-Adult-Token', token);

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AppApiError(
      'Necesitas conexión a internet para vincular.',
      0,
      'OFFLINE',
      { offline: true }
    );
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;

    throw new AppApiError(
      errorBody?.error || `Error ${response.status}`,
      response.status,
      errorBody?.code,
      {
        retryAfterSeconds: errorBody?.retryAfterSeconds,
        attemptsRemaining: errorBody?.attemptsRemaining,
        consent: errorBody?.consent,
      }
    );
  }

  return (await response.json()) as T;
}

export const olderAdultAppService = {
  getToken(): string | null {
    return getStorage()?.getItem(TOKEN_KEY) ?? null;
  },

  setToken(token: string): void {
    getStorage()?.setItem(TOKEN_KEY, token);
  },

  clearToken(): void {
    getStorage()?.removeItem(TOKEN_KEY);
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

  activities(date?: string, token = olderAdultAppService.getToken() ?? ''): Promise<AppActivitiesResponse> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request<AppActivitiesResponse>(`/app/activities${query}`, { token });
  },

  completeActivity(
    id: string,
    date: string,
    token = olderAdultAppService.getToken() ?? ''
  ): Promise<{ message: string }> {
    return request<{ message: string }>(`/app/activities/${id}/complete`, {
      method: 'POST',
      body: { date },
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
    getStorage()?.setItem(CONSENT_CACHE_KEY, JSON.stringify(consent));
  },

  readConsentCache(): ConsentText | null {
    const raw = getStorage()?.getItem(CONSENT_CACHE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ConsentText;
    } catch {
      return null;
    }
  },

  saveRoutineCache(data: AppActivitiesResponse): void {
    const cache: CachedRoutine = {
      savedAt: new Date().toISOString(),
      data,
    };
    getStorage()?.setItem(ROUTINE_CACHE_KEY, JSON.stringify(cache));
  },

  readRoutineCache(): CachedRoutine | null {
    const raw = getStorage()?.getItem(ROUTINE_CACHE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as CachedRoutine;
    } catch {
      return null;
    }
  },

  clearRoutineCache(): void {
    getStorage()?.removeItem(ROUTINE_CACHE_KEY);
  },

  clearAll(): void {
    olderAdultAppService.clearToken();
    olderAdultAppService.clearRoutineCache();
  },
};
