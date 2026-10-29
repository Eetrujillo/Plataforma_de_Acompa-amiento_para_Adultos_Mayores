import type { AppActivity } from '../types';
import { olderAdultAppService } from './olderAdultAppService';

/**
 * HU-016 - Recordatorios de actividades del adulto mayor.
 *
 * El backend entrega `scheduledAt` como un instante absoluto (ISO), asi que el
 * horario del aviso se calcula sin hacer cuentas de zona horaria en el cliente.
 *
 * Alcance real de la plataforma web: los avisos se disparan mientras la app esta
 * abierta, aunque sea en segundo plano. Con la pestana cerrada el navegador no
 * ejecuta temporizadores, y sin internet no hay Web Push. Para cubrir ese caso
 * haria falta Web Push con un servidor o una app nativa; ver README.
 */

export type ReminderKind = 'initial' | 'second';

export type ReminderPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/** Minutos despues del primer aviso en que se repite si la actividad sigue sin marcar. */
export const SECOND_REMINDER_DELAY_MINUTES = 10;

const SECOND_REMINDER_DELAY_MS = SECOND_REMINDER_DELAY_MINUTES * 60 * 1000;

/** Cada cuanto se revisa si toca algun aviso. */
const TICK_MS = 20 * 1000;

/**
 * Ventana de recuperacion: si la app estuvo cerrada o el equipo suspendido, solo
 * se avisa de lo que vencio hace poco. Evita soltar avisos de la manana a la tarde.
 */
const CATCH_UP_WINDOW_MS = 15 * 60 * 1000;

const FIRED_KEY = 'gap_older_adult_reminders_fired';

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

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readFired(): FiredState {
  const raw = getStorage()?.getItem(FIRED_KEY);
  if (!raw) return { date: '', keys: [] };

  try {
    const parsed = JSON.parse(raw) as FiredState;
    if (!parsed || typeof parsed.date !== 'string' || !Array.isArray(parsed.keys)) {
      return { date: '', keys: [] };
    }
    return parsed;
  } catch {
    return { date: '', keys: [] };
  }
}

function writeFired(state: FiredState): void {
  getStorage()?.setItem(FIRED_KEY, JSON.stringify(state));
}

function markFired(key: string, date: string): void {
  const current = readFired();
  // Si cambia el dia se descarta el historial de avisos ya emitidos.
  const keys = current.date === date ? current.keys : [];
  if (keys.includes(key)) return;
  writeFired({ date, keys: [...keys, key] });
}

export function clearFiredReminders(): void {
  getStorage()?.removeItem(FIRED_KEY);
}

export function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

/**
 * Los service workers y las notificaciones solo existen en contexto seguro
 * (HTTPS o localhost). Sin TLS la funcion queda inerte, y conviene decirlo.
 */
export function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

export function getPermission(): ReminderPermission {
  if (!isSupported()) return 'unsupported';
  return Notification.permission;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported()) return Promise.resolve(null);

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch(() => null);
  }

  return registrationPromise;
}

/**
 * Pide permiso de notificaciones. Debe llamarse desde un clic del usuario:
 * los navegadores ignoran la solicitud si no hay gesto previo.
 */
export async function requestPermission(): Promise<ReminderPermission> {
  if (!isSupported()) return 'unsupported';

  unlockAudio();
  await registerServiceWorker();

  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return getPermission();
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return null;

  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }

  return audioContext;
}

/**
 * Los navegadores bloquean el audio hasta que hay una interaccion del usuario.
 * Se llama al activar los avisos para dejar el contexto desbloqueado.
 */
export function unlockAudio(): void {
  const context = getAudioContext();
  if (context && context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }
}

/**
 * Tono corto de respaldo. El sonido del aviso del sistema depende del telefono;
 * esto garantiza que se escuche algo mientras la app esta en pantalla.
 */
export function playChime(): void {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }

  const start = context.currentTime;
  const notes = [880, 1174];

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + index * 0.28;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.25, noteStart + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.26);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.28);
  });
}

function reminderBody(kind: ReminderKind): string {
  return kind === 'initial'
    ? 'Es la hora de tu actividad. Cuando la termines, márcala como hecha.'
    : 'Todavía no la marcaste como hecha. ¿La haces ahora?';
}

function reminderTitle(item: ReminderItem): string {
  return `${item.iconEmoji} ${item.title}`.trim();
}

export async function showReminderNotification(item: ReminderItem): Promise<void> {
  if (getPermission() !== 'granted') return;

  const title = reminderTitle(item);
  const options: NotificationOptions = {
    body: reminderBody(item.kind),
    tag: `${item.activityId}-${item.kind}`,
    requireInteraction: true,
    silent: false,
    lang: 'es',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: '/app', activityId: item.activityId, kind: item.kind },
  };

  const registration = await registerServiceWorker();

  if (registration) {
    try {
      await registration.showNotification(title, options);
      return;
    } catch {
      // Cae al constructor directo si el sistema rechaza el aviso del service worker.
    }
  }

  try {
    new Notification(title, options);
  } catch {
    // Sin notificacion del sistema queda el aviso dentro de la pantalla.
  }
}

/**
 * Construye los avisos del dia a partir de la rutina cacheada.
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
    // Criterio: si ya la marco como completada, no se avisa.
    if (!activity || activity.completed) continue;

    if (now < item.fireAt) continue;
    if (now - item.fireAt > CATCH_UP_WINDOW_MS) continue;
    if (firedKeys.includes(item.key)) continue;

    due.push(item);
  }

  return due;
}

/**
 * Arranca el planificador. Devuelve la funcion para detenerlo.
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
      markFired(item.key, item.key.split('|')[0]);
      onFire(item);
      playChime();
      void showReminderNotification(item);
    }
  }

  function handleVisibility(): void {
    if (document.visibilityState === 'visible') tick();
  }

  tick();

  const timer = window.setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('online', tick);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('online', tick);
  };
}
