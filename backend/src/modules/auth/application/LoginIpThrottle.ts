import type { Clock } from './RegisterCaregiver.ts';
import type { ThrottleDecision } from './ResendThrottle.ts';
import type { LoginIpLimitPort } from './Login.ts';

export interface IpThrottleConfig {
  /** Fallos máximos que acepta la ventana (LOGIN_IP_MAX_ATTEMPTS). */
  max: number;
  /** Tamaño de la ventana en milisegundos (LOGIN_IP_WINDOW_MINUTES). */
  windowMs: number;
}

/** Tope de claves del store en memoria: el vector de memoria no depende del correo (skill rate-limiting regla 7). */
const DEFAULT_MAX_KEYS = 10_000;

/**
 * Límite por IP del login (D2): misma ventana móvil y mismo reloj inyectable
 * que `ResendThrottle`, instancia propia. Vive en el proceso; con más de una
 * réplica el límite real es *N por ventana por réplica* (limitación documentada).
 */
export class LoginIpThrottle implements LoginIpLimitPort {
  private readonly failures = new Map<string, number[]>();
  private readonly clock: Clock;
  private readonly config: IpThrottleConfig;
  private readonly maxKeys: number;

  constructor(clock: Clock, config: IpThrottleConfig, maxKeys: number = DEFAULT_MAX_KEYS) {
    this.clock = clock;
    this.config = config;
    this.maxKeys = maxKeys;
  }

  /**
   * Lectura previa a la base (D3): no registra nada — la ventana sólo avanza
   * con fallos reales, así el rechazo no extiende el bloqueo (regla 6).
   */
  check(rawIp: string): ThrottleDecision {
    const key = rawIp.trim();
    const now = this.clock.now().getTime();
    this.prune(now);
    const windowStart = now - this.config.windowMs;
    const current = (this.failures.get(key) ?? []).filter((stamp) => stamp > windowStart);
    if (current.length >= this.config.max) {
      const oldest = current[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.config.windowMs - now) / 1000)),
      };
    }
    return { allowed: true };
  }

  /** Registra un fallo ya respondido (401 desde cuenta o correo inexistente). */
  recordFailure(rawIp: string): void {
    const key = rawIp.trim();
    if (key === '') return;
    const now = this.clock.now().getTime();
    this.prune(now);
    const windowStart = now - this.config.windowMs;
    const current = (this.failures.get(key) ?? []).filter((stamp) => stamp > windowStart);
    current.push(now);
    this.failures.set(key, current);
    this.capKeys();
  }

  /** Poda: descarta entradas con la ventana vencida y respeta el tope de claves (regla 7). */
  private prune(now: number): void {
    const windowStart = now - this.config.windowMs;
    for (const [key, stamps] of this.failures) {
      if (stamps.length > 0 && stamps.every((stamp) => stamp <= windowStart)) this.failures.delete(key);
    }
  }

  private capKeys(): void {
    // El tope se respeta tras insertar: se descarta la clave más vieja, así una
    // tanda de IPs inventadas no es un vector de memoria (regla 7).
    while (this.failures.size > this.maxKeys) {
      const oldestKey = this.failures.keys().next().value;
      if (oldestKey === undefined) break;
      this.failures.delete(oldestKey);
    }
  }
}
