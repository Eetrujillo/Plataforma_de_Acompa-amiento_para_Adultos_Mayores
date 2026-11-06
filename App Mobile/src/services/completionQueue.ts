import { AppState } from 'react-native';

import { STORAGE_KEYS } from '../config';
import { AppApiError, olderAdultAppService } from './olderAdultAppService';
import { isOnline, subscribeConnectivity } from './connectivity';
import { readJson, writeJson } from './storage';
import type { QueuedCompletion } from '../types';

/**
 * HU-019 - Marcas de actividad hechas sin internet.
 *
 * Cada marca se guarda primero en el dispositivo y se intenta enviar de
 * inmediato. Si no hay conexión, o si el envío falla, queda en la cola y se
 * reintenta sola: al recuperar la red, al volver a la app y cada 15 segundos.
 *
 * La hora que se envía es la del toque en el celular (`completedAt`), no la del
 * envío. Así el familiar ve la hora real aunque la confirmación llegue tarde.
 *
 * Diferencia con la web: `AsyncStorage` es asíncrono. La cola vive en memoria
 * después de la hidratación inicial, así que las lecturas siguen siendo
 * síncronas y la pantalla no parpadea.
 */

/** Cada cuánto se reintenta el envío mientras haya algo en cola. */
const SYNC_INTERVAL_MS = 15 * 1000;

type Listener = () => void;

const listeners = new Set<Listener>();

/** Evita dos envíos simultáneos de la misma cola. */
let syncing = false;

function isQueuedCompletion(value: unknown): value is QueuedCompletion {
  if (!value || typeof value !== 'object') return false;

  const item = value as Record<string, unknown>;

  return (
    typeof item.activityId === 'string' &&
    typeof item.date === 'string' &&
    typeof item.completedAt === 'string'
  );
}

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(items: QueuedCompletion[]): void {
  // Se guarda siempre el arreglo completo: la cola es pequeña (una entrada por
  // actividad y día) y así se evita una lectura asíncrona en cada cambio.
  writeJson(STORAGE_KEYS.pendingCompletions, items);
}

export function readCompletionQueue(): QueuedCompletion[] {
  const parsed = readJson<unknown>(STORAGE_KEYS.pendingCompletions);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isQueuedCompletion);
}

export function subscribeToCompletionQueue(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function findQueuedCompletion(
  activityId: string,
  date: string
): QueuedCompletion | null {
  return (
    readCompletionQueue().find(
      (item) => item.activityId === activityId && item.date === date
    ) ?? null
  );
}

export function enqueueCompletion(input: {
  activityId: string;
  date: string;
  completedAt: string;
}): void {
  const rest = readCompletionQueue().filter(
    (item) => !(item.activityId === input.activityId && item.date === input.date)
  );

  rest.push({
    activityId: input.activityId,
    date: input.date,
    completedAt: input.completedAt,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
  });

  persist(rest);
  notify();
}

export function removeQueuedCompletion(activityId: string, date: string): boolean {
  const current = readCompletionQueue();
  const next = current.filter(
    (item) => !(item.activityId === activityId && item.date === date)
  );

  if (next.length === current.length) return false;

  persist(next);
  notify();
  return true;
}

export function clearCompletionQueue(): void {
  persist([]);
  notify();
}

function markAttempt(activityId: string, date: string): void {
  const next = readCompletionQueue().map((item) =>
    item.activityId === activityId && item.date === date
      ? { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() }
      : item
  );

  // `silent` en la web: no se avisa a la interfaz por un reintento fallido.
  persist(next);
}

/**
 * Intenta enviar todo lo que esté en cola.
 * - Éxito: la marca sale de la cola.
 * - Sin conexión, 401 o consentimiento vencido: se deja para el siguiente ciclo.
 * - 400 o 404: la actividad ya no aplica, se descarta para no reintentar sin fin.
 * - Cualquier otro error: se queda y se reintenta.
 */
export async function flushCompletionQueue(): Promise<void> {
  if (syncing) return;
  if (!isOnline()) return;
  if (!olderAdultAppService.hasToken()) return;

  const queue = readCompletionQueue();
  if (queue.length === 0) return;

  syncing = true;

  try {
    for (const item of queue) {
      // La pantalla pudo haber deshecho la marca mientras tanto.
      if (!findQueuedCompletion(item.activityId, item.date)) continue;

      try {
        await olderAdultAppService.completeActivity(
          item.activityId,
          item.date,
          item.completedAt
        );
        removeQueuedCompletion(item.activityId, item.date);
      } catch (err) {
        if (err instanceof AppApiError) {
          if (err.status === 404 || err.status === 400) {
            removeQueuedCompletion(item.activityId, item.date);
            continue;
          }

          if (err.status === 401 || err.code === 'CONSENT_VERSION_OUTDATED') {
            return;
          }
        }

        markAttempt(item.activityId, item.date);
      }
    }
  } finally {
    syncing = false;
  }
}

/**
 * Arranca el envío automático. Devuelve la función para detenerlo.
 * Se monta una sola vez en el layout raíz para que siga vivo en cualquier
 * pantalla, igual que `CompletionSyncHost` en la web.
 */
export function startCompletionSync(): () => void {
  let stopped = false;

  function flush(): void {
    if (stopped) return;
    void flushCompletionQueue();
  }

  const unsubscribeConnectivity = subscribeConnectivity((online) => {
    if (online) flush();
  });

  // En móvil, volver del segundo plano equivale a `visibilitychange` en la web.
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') flush();
  });

  const timer = setInterval(flush, SYNC_INTERVAL_MS);

  flush();

  return () => {
    stopped = true;
    clearInterval(timer);
    unsubscribeConnectivity();
    appStateSubscription.remove();
  };
}
