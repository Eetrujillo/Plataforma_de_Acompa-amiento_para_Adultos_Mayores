import type { Clock } from './RegisterCaregiver.ts';
import { normalizeEmail } from '../domain/User.ts';

/**
 * Límite de reenvíos por ventana móvil (skill rate-limiting). El contador es
 * una regla de negocio: vive en el caso de uso, no en el router, y se prueba
 * sin HTTP con un reloj inyectado.
 */

export interface ThrottleConfig {
  /** Máximo de intentos aceptados dentro de la ventana. */
  max: number;
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number;
}

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Tope de claves del store en memoria: una tanda de correos inventados no es un vector de memoria. */
const DEFAULT_MAX_KEYS = 10_000;

export class ResendThrottle {
  private readonly attempts = new Map<string, number[]>();
  private readonly clock: Clock;
  private readonly config: ThrottleConfig;
  private readonly maxKeys: number;

  constructor(clock: Clock, config: ThrottleConfig, maxKeys: number = DEFAULT_MAX_KEYS) {
    this.clock = clock;
    this.config = config;
    this.maxKeys = maxKeys;
  }

  /**
   * Consume un cupo para la clave (correo normalizado, skill rate-limiting
   * regla 3) o informa cuánto falta para que se libere uno. El intento
   * bloqueado NO se registra: contar rechazos extendería la ventana para
   * siempre (regla 6).
   */
  consume(rawKey: string): ThrottleDecision {
    const key = normalizeEmail(rawKey);
    const now = this.clock.now().getTime();
    this.prune(now);
    const windowStart = now - this.config.windowMs;
    const current = (this.attempts.get(key) ?? []).filter((stamp) => stamp > windowStart);
    if (current.length >= this.config.max) {
      const oldest = current[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.config.windowMs - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    current.push(now);
    this.attempts.set(key, current);
    return { allowed: true };
  }

  /** Poda: descarta entradas con la ventana vencida y respeta el tope de claves (regla 7). */
  private prune(now: number): void {
    const windowStart = now - this.config.windowMs;
    for (const [key, stamps] of this.attempts) {
      if (stamps.every((stamp) => stamp <= windowStart)) this.attempts.delete(key);
    }
    while (this.attempts.size >= this.maxKeys) {
      const oldestKey = this.attempts.keys().next().value;
      if (oldestKey === undefined) break;
      this.attempts.delete(oldestKey);
    }
  }
}
