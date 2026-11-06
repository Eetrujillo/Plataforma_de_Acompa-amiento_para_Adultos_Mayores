import { DEFAULT_API_BASE, STORAGE_KEYS } from '../config';
import { getCached, removeCached, setCached } from './storage';

/**
 * Dirección efectiva del backend.
 *
 * Precedencia:
 * 1. La URL que el usuario guardó en la pantalla «Servidor».
 * 2. `DEFAULT_API_BASE` (variable de entorno o detección automática de Expo).
 *
 * Se resuelve en cada petición y no al arrancar: cambiar de servidor no exige
 * reiniciar la app ni volver a compilar el bundle.
 */

/**
 * Normaliza lo que escribe el usuario.
 *
 * Acepta una URL absoluta (`http://192.168.1.20:3500/api`) o una ruta relativa
 * (`/api`, cuando la web y la API comparten origen detrás de Nginx).
 * Devuelve `null` si no es ninguna de las dos.
 */
export function normalizeApiBase(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  if (trimmed.startsWith('/')) return trimmed.replace(/\/+$/, '') || '/';

  if (!/^https?:\/\//i.test(trimmed)) return null;

  return trimmed.replace(/\/+$/, '');
}

export function getApiBase(): string {
  return getCached(STORAGE_KEYS.apiBase) ?? DEFAULT_API_BASE;
}

export function setApiBase(value: string): boolean {
  const normalized = normalizeApiBase(value);

  if (!normalized) return false;

  setCached(STORAGE_KEYS.apiBase, normalized);
  return true;
}

/** Vuelve a la URL detectada automáticamente. */
export function resetApiBase(): void {
  removeCached(STORAGE_KEYS.apiBase);
}

export function isCustomApiBase(): boolean {
  return getCached(STORAGE_KEYS.apiBase) !== null;
}

/**
 * Comprueba que el servidor responda.
 *
 * Usa `/health`, que es público y no toca la base de datos: sirve para
 * distinguir «no hay red / URL equivocada» de «el backend está caído».
 */
export async function checkBackend(base = getApiBase(), timeoutMs = 8000): Promise<{
  ok: boolean;
  url: string;
  status?: number;
  latencyMs?: number;
  message: string;
}> {
  const url = `${base}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        latencyMs,
        message: `El servidor respondió ${response.status}.`,
      };
    }

    return {
      ok: true,
      url,
      status: response.status,
      latencyMs,
      message: `Conexión correcta (${latencyMs} ms).`,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';

    return {
      ok: false,
      url,
      message: aborted
        ? 'El servidor tardó demasiado en responder.'
        : 'No se pudo conectar. Revisa la URL y que el backend esté encendido.',
    };
  } finally {
    clearTimeout(timer);
  }
}
