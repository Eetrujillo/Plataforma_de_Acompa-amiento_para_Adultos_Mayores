import { AppApiError, olderAdultAppService, PENDING_COMPLETIONS_KEY } from './olderAdultAppService';

/**
 * HU-019 - Marcas de actividad hechas sin internet.
 *
 * Cada marca se guarda primero en `localStorage` y se intenta enviar de
 * inmediato. Si no hay conexion, o si el envio falla, queda en la cola y se
 * reintenta sola: al recuperar la red, al volver a la app y cada pocos segundos.
 *
 * La hora que se envia es la del toque en el celular (`completedAt`), no la del
 * envio. Asi el familiar ve la hora real aunque la confirmacion llegue tarde.
 */

export interface QueuedCompletion {
  activityId: string;
  date: string;
  completedAt: string;
  queuedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
}

/** Cada cuanto se reintenta el envio mientras haya algo en cola. */
const SYNC_INTERVAL_MS = 15 * 1000;

type Listener = () => void;

const listeners = new Set<Listener>();

/** Evita dos envios simultaneos de la misma cola. */
let syncing = false;

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

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

function writeQueue(items: QueuedCompletion[], { silent = false } = {}): void {
  const storage = getStorage();
  if (!storage) return;

  if (items.length === 0) storage.removeItem(PENDING_COMPLETIONS_KEY);
  else storage.setItem(PENDING_COMPLETIONS_KEY, JSON.stringify(items));

  if (!silent) notify();
}

export function readCompletionQueue(): QueuedCompletion[] {
  const raw = getStorage()?.getItem(PENDING_COMPLETIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isQueuedCompletion);
  } catch {
    return [];
  }
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

  writeQueue(rest);
}

export function removeQueuedCompletion(activityId: string, date: string): boolean {
  const current = readCompletionQueue();
  const next = current.filter(
    (item) => !(item.activityId === activityId && item.date === date)
  );

  if (next.length === current.length) return false;

  writeQueue(next);
  return true;
}

export function clearCompletionQueue(): void {
  writeQueue([]);
}

function markAttempt(activityId: string, date: string): void {
  const next = readCompletionQueue().map((item) =>
    item.activityId === activityId && item.date === date
      ? { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() }
      : item
  );

  writeQueue(next, { silent: true });
}

/**
 * Intenta enviar todo lo que este en cola.
 * - Exito: la marca sale de la cola.
 * - Sin conexion, 401 o consentimiento vencido: se deja para el siguiente ciclo.
 * - 400 o 404: la actividad ya no aplica, se descarta para no reintentar sin fin.
 * - Cualquier otro error: se queda y se reintenta.
 */
export async function flushCompletionQueue(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
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
 * Arranca el envio automatico. Devuelve la funcion para detenerlo.
 * Se monta una sola vez en `main.jsx` para que siga vivo en cualquier pantalla.
 */
export function startCompletionSync(): () => void {
  let stopped = false;

  function flush(): void {
    if (stopped) return;
    void flushCompletionQueue();
  }

  function handleOnline(): void {
    flush();
  }

  function handleVisibility(): void {
    if (document.visibilityState === 'visible') flush();
  }

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  const timer = window.setInterval(flush, SYNC_INTERVAL_MS);

  flush();

  return () => {
    stopped = true;
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.clearInterval(timer);
  };
}
