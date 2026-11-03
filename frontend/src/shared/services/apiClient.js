import axios from 'axios';

import { API_BASE_URL } from '../../app/config/runtime.js';
import { clearSession, readSession } from './sessionToken.js';

/**
 * Single Axios instance for every slice.
 *
 * - attaches the bearer token of the current session
 * - normalizes API errors to a readable Spanish message
 * - drops the session when the token is no longer valid
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use((request) => {
  const session = readSession();

  if (session?.token) {
    request.headers.Authorization = `Bearer ${session.token}`;
  }

  return request;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession();
    }

    const apiMessage = error.response?.data?.error?.message;
    const normalized = new Error(
      apiMessage || 'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.'
    );

    normalized.status = error.response?.status ?? 0;
    normalized.code = error.response?.data?.error?.code ?? 'NETWORK_ERROR';

    return Promise.reject(normalized);
  }
);

export { API_BASE_URL };
