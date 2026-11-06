import { AppState, Platform, Vibration } from 'react-native';

import { STORAGE_KEYS } from '../config';
import { olderAdultAppService } from './olderAdultAppService';
import { readJson, removeCached, writeJson } from './storage';
import type { AppActivity } from '../types';

/**
 * HU-016 - Recordatorios de actividades del adulto mayor.
 *
 * El backend entrega `scheduledAt` como instante absoluto (ISO), así que el
 * horario del aviso no requiere cuentas de zona horaria en el cliente.
 *
 * Alcance real, igual que en la web:
 * - El aviso **en pantalla** funciona siempre que la app esté abierta.
 * - En web se intenta además la notificación del sistema (`Notification`), que
 *   el navegador solo permite con la pestaña abierta o en segundo plano.
 * - En móvil se agrega vibración. Para notificaciones con la app cerrada haría
 *   falta `expo-notifications` y un build nativo; queda documentado en el README
 *   y no se incluye para no romper la exportación web.
 */

export type ReminderKind = 'initial' | 'second';

export type ReminderPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/** Minutos después del primer aviso en que se repite si sigue sin marcar. */
export const SECOND_REMINDER_DELAY_MINUTES = 10;

const SECOND_REMINDER_DELAY_MS = SECOND_REMINDER_DELAY_MINUTES * 60 * 1000;

/** Cada cuánto se revisa si toca algún aviso. */
const TICK_MS = 20 * 1000;

/**
 * Ventana de recuperación: si la app estuvo cerrada o el equipo suspendido, solo
 * se avisa de lo que venció hace poco. Evita soltar avisos de la mañana a la tarde.
 */
const CATCH_UP_WINDOW_MS = 15 * 60 * 1000;

export interface ReminderItem {
  key: string;
  activityId: string;
  title: string;
  iconEmoji: string;
  kind: ReminderKind;
  fireAt: number;
  time: string;
}

interface FiredState {
  date: string;
  keys: string[];
}

/** Tipo mínimo de la API de notificaciones del navegador (solo web). */
interface WebNotificationApi {
  permission: ReminderPermission;
  requestPermission: () => Promise<ReminderPermission>;
}

function getWebNotification(): WebNotificationApi | null {
  if (Platform.OS !== 'web') return null;

  const api = (globalThis as { Notification?: WebNotificationApi }).Notification;
  return api && typeof api.requestPermission === 'function' ? api : null;
}

function readFired(): FiredState {
  const parsed = readJson<FiredState>(STORAGE_KEYS.firedReminders);

  if (!parsed || typeof parsed.date !== 'string' || !Array.isArray(parsed.keys)) {
    return { date: '', keys: [] };
  }

  return parsed;
}

function markFired(key: string, date: string): void {
  const current = readFired();
  // Si cambia el día se descarta el historial de avisos ya emitidos.
  const keys = current.date === date ? current.keys : [];
  if (keys.includes(key)) return;

  writeJson(STORAGE_KEYS.firedReminders, { date, keys: [...keys, key] });
}

export function clearFiredReminders(): void {
  removeCached(STORAGE_KEYS.firedReminders);
}

/** El aviso en pantalla siempre está disponible; el del sistema depende del equipo. */
export function isSupported(): boolean {
  return true;
}

/** Los service workers y notificaciones web exigen HTTPS o localhost. */
export function isSecureContext(): boolean {
  if (Platform.OS !== 'web') return true;

  const secure = (globalThis as { isSecureContext?: boolean }).isSecureContext;
  return secure === true;
}

export function getPermission(): ReminderPermission {
  const api = getWebNotification();
  if (!api) {
    // En móvil el aviso en pantalla no necesita permiso del sistema.
    return 'granted';
  }

  return api.permission;
}

/**
 * Pide permiso de notificaciones. Debe llamarse desde un toque del usuario:
 * los navegadores ignoran la solicitud si no hay gesto previo.
 */
export async function requestPermission(): Promise<ReminderPermission> {
  const api = getWebNotification();
  if (!api) return 'granted';

  try {
    return await api.requestPermission();
  } catch {
    return getPermission();
  }
}

/**
 * Señal sonora/táctil. En móvil se usa vibración porque el sonido del aviso en
 * pantalla lo controla el sistema; en web no hay API equivalente fiable.
 */
export function signalReminder(): void {
  if (Platform.OS === 'web') return;

  try {
    Vibration.vibrate([0, 250, 150, 250]);
  } catch {
    // Algunos equipos no tienen motor de vibración.
  }
}

function reminderBody(kind: ReminderKind): string {
  return kind === 'initial'
    ? 'Es la hora de tu actividad. Cuando la termines, márcala como hecha.'
    : 'Todavía no la marcaste como hecha. ¿La haces ahora?';
}

function reminderTitle(item: ReminderItem): string {
  return `${item.iconEmoji} ${item.title}`.trim();
}

/** Notificación del sistema. En móvil no está disponible en esta entrega. */
export function showReminderNotification(item: ReminderItem): void {
  const api = getWebNotification();
  if (!api || api.permission !== 'granted') return;

  try {
    const Ctor = (globalThis as unknown as {
      Notification: new (title: string, options?: Record<string, unknown>) => unknown;
    }).Notification;

    new Ctor(reminderTitle(item), {
      body: reminderBody(item.kind),
      tag: `${item.activityId}-${item.kind}`,
      requireInteraction: true,
      lang: 'es',
    });
  } catch {
    // Sin notificación del sistema queda el aviso dentro de la pantalla.
  }
}

/**
 * Construye los avisos del día a partir de la rutina cacheada.
 * `scheduledAt` es un instante absoluto, por lo que no depende de la zona horaria.
 */
export function buildReminders(activities: AppActivity[], dateKey: string): ReminderItem[] {
  const items: ReminderItem[] = [];

  for (const activity of activities) {
    const base = Date.parse(activity.scheduledAt);
    if (Number.isNaN(base)) continue;

    items.push({
      key: `${dateKey}|${activity._id}|initial|${base}`,
      activityId: activity._id,
      title: activity.title,
      iconEmoji: activity.iconEmoji,
      kind: 'initial',
      fireAt: base,
      time: activity.time,
    });

    items.push({
      key: `${dateKey}|${activity._id}|second|${base}`,
      activityId: activity._id,
      title: activity.title,
      iconEmoji: activity.iconEmoji,
      kind: 'second',
      fireAt: base + SECOND_REMINDER_DELAY_MS,
      time: activity.time,
    });
  }

  return items;
}

function collectDue(now: number): ReminderItem[] {
  if (!olderAdultAppService.hasToken()) return [];

  const cached = olderAdultAppService.readRoutineCache();
  if (!cached) return [];

  const { data } = cached;
  if (!Array.isArray(data.activities) || data.activities.length === 0) return [];

  const fired = readFired();
  const firedKeys = fired.date === data.date ? fired.keys : [];
  const due: ReminderItem[] = [];

  for (const item of buildReminders(data.activities, data.date)) {
    const activity = data.activities.find((entry) => entry._id === item.activityId);
    // Criterio: si ya la marcó como completada, no se avisa.
    if (!activity || activity.completed) continue;

    if (now < item.fireAt) continue;
    if (now - item.fireAt > CATCH_UP_WINDOW_MS) continue;
    if (firedKeys.includes(item.key)) continue;

    due.push(item);
  }

  return due;
}

/**
 * Arranca el planificador. Devuelve la función para detenerlo.
 * Cada tick lee la rutina cacheada, de modo que un cambio de hora hecho por el
 * familiar se refleja en el siguiente ciclo sin reiniciar nada.
 */
export function startReminderScheduler(onFire: (item: ReminderItem) => void): () => void {
  let stopped = false;

  function tick(): void {
    if (stopped) return;

    const now = Date.now();
    const due = collectDue(now);
    if (due.length === 0) return;

    for (const item of due) {
      markFired(item.key, item.key.split('|')[0] ?? '');
      onFire(item);
      signalReminder();
      showReminderNotification(item);
    }
  }

  // En móvil, volver del segundo plano equivale a `visibilitychange` en la web.
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') tick();
  });

  tick();

  const timer = setInterval(tick, TICK_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    appStateSubscription.remove();
  };
}
