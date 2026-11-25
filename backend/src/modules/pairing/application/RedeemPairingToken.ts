/**
 * HU-009 / T3 — canje del QR de vinculación. El orden vive acá, no en el
 * controlador ni en los adaptadores (D5/D6):
 *
 *   1. Consentimiento (D3/ley-1581 §4): sin la bandera no hay canje.
 *   2. Throttle por IP (D9): `check` antes de tocar la base; los 429 no cuentan.
 *   3. Forma del token: malformado → 400 genérico sin consultas (S12).
 *   4. Lectura del token por hash → desconocido responde 404 (S14).
 *   5. Guardia del perfil (S17/D6): existe, sigue del dueño del token y sigue
 *      pendiente. Ajeno o inexistente → el mismo 409 genérico de un token
 *      consumido (nunca confirma el id); vinculado → `SENIOR_ALREADY_LINKED`
 *      SIN quemar el QR.
 *   6. Bloqueo por perfil (D8): un intento bloqueado no quema el token ni cuenta.
 *   7. RECLAMO atómico de un solo uso (S8/S16): el perdedor recibe el mismo 409
 *      genérico, desambiguado con una lectura posterior (D5). Uno ya usado no
 *      cuenta como fallo del perfil (D14.2): sólo la credencial inservible por
 *      vencimiento o invalidación acumula.
 *   8. Sesión de SENIOR firmada por el módulo auth (D10): es pura y va ANTES
 *      de la escritura irreversible (D15.2) — nada puede fallar después.
 *   9. Escritura del vínculo con la evidencia (D4/D7). Si falla, el token ya
 *      quedó quemado: falla cerrado (S18) y el error sube como 500.
 *  10. Contador limpio best-effort (D15.2): su fallo no toca la respuesta.
 */
import { AppError } from '../../../shared/errors/AppError.ts';
import { ACCOUNT_LOCKED_MESSAGE, LOGIN_IP_LIMIT_MESSAGE } from '../../auth/application/Login.ts';
import type { SessionTokenPort, LoginIpLimitPort } from '../../auth/application/Login.ts';
import type { Clock } from '../../auth/application/RegisterCaregiver.ts';
import { sessionClaims } from '../../auth/domain/sessionClaims.ts';
import { evaluateLockout, lockoutRetrySeconds } from '../../auth/domain/loginLockout.ts';
import type { LockoutConfig, LockoutState } from '../../auth/domain/loginLockout.ts';
import {
  evaluatePairingTokenState,
  hashPairingToken,
  isPairingTokenWellFormed,
} from '../domain/pairingToken.ts';
import {
  PAIRING_TOKEN_INVALID_MESSAGE,
  PAIRING_TOKEN_NOT_FOUND_MESSAGE,
  PAIRING_TOKEN_ALREADY_USED_MESSAGE,
  REDEEM_TERMS_NOT_ACCEPTED_MESSAGE,
  SENIOR_ALREADY_LINKED_MESSAGE,
} from './pairingMessages.ts';
import type { PairingTokenRepositoryPort, PairingTokenRecord } from './PairingTokenRepositoryPort.ts';
import type { RedeemProfileReaderPort, RedeemSeniorProfile } from './SeniorProfileReaderPort.ts';
import type { RedeemSeniorWriterPort } from './RedeemSeniorWriterPort.ts';

export interface RedeemPairingTokenCommand {
  /** El token crudo del cuerpo: la forma la valida el caso de uso (S12). */
  readonly token: unknown;
  /** D3: la bandera del titular. `true` estricto, como en el registro. */
  readonly acceptedTerms: boolean;
  /** IP del pedido ya validada con `evidenceIp`; `undefined` si no era una IP. */
  readonly ipAddress?: string;
}

/** La respuesta exacta de S13: `token` + `senior`, ni un campo más (D11/S19). */
export interface RedeemResponseSenior {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: 'SENIOR';
  readonly phone: string | null;
  readonly caregiverId: string;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
  readonly linkStatus: 'LINKED';
  readonly timezone: string;
}

export interface RedeemPairingTokenResult {
  readonly token: string;
  readonly senior: RedeemResponseSenior;
}

export interface RedeemPairingTokenDeps {
  tokenRepository: PairingTokenRepositoryPort;
  seniorReader: RedeemProfileReaderPort;
  seniorWriter: RedeemSeniorWriterPort;
  /** D10: el único firmante es el módulo auth; nadie arma un JWT a mano. */
  sessionToken: SessionTokenPort;
  /** D9: in-memory, instancia propia del canje, reloj inyectado. */
  ipThrottle: LoginIpLimitPort;
  /** D8: `REDEEM_MAX_ATTEMPTS` (5) / `REDEEM_LOCKOUT_MINUTES` (15). */
  lockout: LockoutConfig;
  /** D15.3: ventana del replay en ms (`REDEEM_RECOVERY_MINUTES` × 60 000). */
  recoveryMs: number;
  clock: Clock;
  /** `TERMS_VERSION` de la config (D4). */
  termsVersion: string;
}

const LOCKED_OUT_STATE: LockoutState = { failedLoginAttempts: null, lockedUntil: null };

export class RedeemPairingToken {
  private readonly tokenRepository: PairingTokenRepositoryPort;
  private readonly seniorReader: RedeemProfileReaderPort;
  private readonly seniorWriter: RedeemSeniorWriterPort;
  private readonly sessionToken: SessionTokenPort;
  private readonly ipThrottle: LoginIpLimitPort;
  private readonly lockout: LockoutConfig;
  private readonly recoveryMs: number;
  private readonly clock: Clock;
  private readonly termsVersion: string;

  constructor(deps: RedeemPairingTokenDeps) {
    this.tokenRepository = deps.tokenRepository;
    this.seniorReader = deps.seniorReader;
    this.seniorWriter = deps.seniorWriter;
    this.sessionToken = deps.sessionToken;
    this.ipThrottle = deps.ipThrottle;
    this.lockout = deps.lockout;
    this.recoveryMs = deps.recoveryMs;
    this.clock = deps.clock;
    this.termsVersion = deps.termsVersion;
  }

  /** D10: los claims de la sesión del titular, firmados en un único lugar. */
  private signSeniorSession(profile: RedeemSeniorProfile): string {
    return this.sessionToken.sign(
      sessionClaims({ id: profile.id, email: profile.email, role: 'SENIOR', sessionVersion: profile.sessionVersion }),
    );
  }

  async execute(command: RedeemPairingTokenCommand): Promise<RedeemPairingTokenResult> {
    // D3/ley-1581 §4: sin la bandera no hay canje — rechazo inmediato, sin
    // throttle, sin base, sin escritura.
    if (command.acceptedTerms !== true) {
      throw new AppError(400, 'TERMS_NOT_ACCEPTED', REDEEM_TERMS_NOT_ACCEPTED_MESSAGE);
    }

    const ip = command.ipAddress ?? '';
    // D9: el límite por IP va antes de tocar la base, como en el login. El
    // intento bloqueado no se registra (regla 6 de skill rate-limiting).
    const ipDecision = this.ipThrottle.check(ip);
    if (!ipDecision.allowed) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', LOGIN_IP_LIMIT_MESSAGE, {
        retryAfterSeconds: ipDecision.retryAfterSeconds,
      });
    }

    // S12: la forma se rechaza antes de hashear y sin consultas.
    if (typeof command.token !== 'string' || !isPairingTokenWellFormed(command.token)) {
      this.ipThrottle.recordFailure(ip);
      throw new AppError(400, 'VALIDATION_ERROR', PAIRING_TOKEN_INVALID_MESSAGE);
    }
    const token: string = command.token;
    const tokenHash = hashPairingToken(token);
    const now = this.clock.now();

    const record = await this.tokenRepository.findByTokenHash(tokenHash);
    if (record === null) {
      // S14: el desconocido sólo delata su propia falta.
      this.ipThrottle.recordFailure(ip);
      throw new AppError(404, 'NOT_FOUND', PAIRING_TOKEN_NOT_FOUND_MESSAGE);
    }

    // S17/D6: el perfil existe, sigue siendo del dueño del token y sigue
    // pendiente — todo ANTES del reclamo, para no quemar un QR que sirve.
    const profile = await this.seniorReader.findRedeemSeniorForCaregiver(
      record.seniorId,
      record.caregiverId,
    );
    if (profile === null) {
      // Ajeno o borrado: el mismo 409 genérico de un token consumido.
      this.ipThrottle.recordFailure(ip);
      throw new AppError(409, 'CONFLICT', PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }
    if (profile.linkStatus !== 'PENDING') {
      // El `null` del legacy ya tenía dispositivo: también va por acá.
      // D15.3: replay de recuperación — el reintento de una respuesta que nunca
      // llegó: token YA usado, perfil LINKED del dueño, dentro de la ventana;
      // mismo throttle por IP y mismo bloqueo. No escribe NADA: re-firma.
      const usedAt = record.usedAt;
      if (
        profile.linkStatus === 'LINKED' && usedAt !== null &&
        now.getTime() - usedAt.getTime() <= this.recoveryMs
      ) {
        const lockState = (await this.seniorWriter.redeemLockoutState(profile.id)) ?? LOCKED_OUT_STATE;
        const verdict = evaluateLockout(lockState, now);
        if (verdict.locked) {
          throw new AppError(429, 'ACCOUNT_LOCKED', ACCOUNT_LOCKED_MESSAGE, {
            retryAfterSeconds: verdict.retryAfterSeconds,
          });
        }
        return {
          token: this.signSeniorSession(profile),
          senior: buildResponseSenior(profile, record),
        };
      }
      this.ipThrottle.recordFailure(ip);
      throw new AppError(409, 'SENIOR_ALREADY_LINKED', SENIOR_ALREADY_LINKED_MESSAGE);
    }

    // D8/S7: bloqueo por perfil, antes del reclamo — el intento bloqueado no
    // quema el QR ni se cuenta.
    const lockState = (await this.seniorWriter.redeemLockoutState(profile.id)) ?? LOCKED_OUT_STATE;
    const verdict = evaluateLockout(lockState, now);
    if (verdict.locked) {
      throw new AppError(429, 'ACCOUNT_LOCKED', ACCOUNT_LOCKED_MESSAGE, {
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
    }

    // S8/S16: reclamo condicional de un solo uso. El perdedor de la carrera
    // desambigua con una lectura posterior (D5) y — D14.2 — sólo la credencial
    // inservible por vencimiento o invalidación registra el fallo del perfil
    // (D8): `handleLostClaim` siempre lanza, pero el 409 del token ya usado no
    // mueve el contador del perfil.
    const claimed = await this.tokenRepository.claimUnused(tokenHash, now);
    if (claimed === null) {
      await this.handleLostClaim(tokenHash, profile.id, now, ip);
    }

    // D4/D7: LINKED + evidencia en LA MISMA escritura condicional. Si falla
    // acá, el token ya está quemado (S18: falla cerrado) y el error sube — el
    // errorHandler lo enmascara como 500 y el familiar emite otro QR.
    // D15.2: la sesión es pura — se firma ANTES de la escritura irreversible.
    const session = this.signSeniorSession(profile);
    const linked = await this.seniorWriter.markLinkedWithConsent({
      seniorId: profile.id,
      acceptedTermsAt: now,
      termsVersion: this.termsVersion,
      ...(command.ipAddress === undefined ? {} : { ipAddress: command.ipAddress }),
    });
    if (!linked) {
      // Otro pedido ya vinculó el perfil con este token en su carrera: el mismo
      // 409 genérico de S16.
      throw new AppError(409, 'CONFLICT', PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }

    // S7/D15.2: limpiar la racha es best-effort — un canje completado no se
    // convierte en error por el contador (cosmético tras el éxito).
    try {
      await this.seniorWriter.clearRedeemFailures(profile.id);
    } catch {
      // la racha se limpia en la próxima oportunidad (otro éxito o emisión)
    }
    return {
      token: session,
      senior: buildResponseSenior(profile, record),
    };
  }

  /**
   * D5/S14: el reclamo se perdió. Primero la desambiguación con una lectura
   * posterior: sin documento → 404; usado → el mismo 409 genérico; lo demás →
   * 400. D14.2: sólo la credencial inservible por vencimiento o invalidación
   * registra el fallo del perfil (D8 — puede disparar el bloqueo y responder
   * 429); el token ya canjeado no mueve ninguna racha — un doble toque o un QR
   * viejo no puede dejar al adulto mayor sin poder vincularse. El límite por
   * IP sí cuenta el intento siempre (D9), como hoy.
   */
  private async handleLostClaim(
    tokenHash: string,
    seniorId: string,
    now: Date,
    ip: string,
  ): Promise<never> {
    const loser = await this.tokenRepository.findByTokenHash(tokenHash);
    if (loser === null) {
      // S14: el desconocido sólo delata su propia falta.
      this.ipThrottle.recordFailure(ip);
      throw new AppError(404, 'NOT_FOUND', PAIRING_TOKEN_NOT_FOUND_MESSAGE);
    }
    const state = evaluatePairingTokenState(loser, now);
    if (state === 'USED') {
      // D14.2: ya canjeado → el mismo 409 de siempre, sin contar fallo del perfil.
      this.ipThrottle.recordFailure(ip);
      throw new AppError(409, 'CONFLICT', PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }
    this.ipThrottle.recordFailure(ip);
    if (state === 'EXPIRED' || state === 'INVALIDATED') {
      // D8: credencial inservible por vencimiento o invalidación — ésta sí
      // cuenta como fallo del perfil (D14.2).
      const persisted = await this.seniorWriter.registerRedeemFailure(seniorId, {
        maxAttempts: this.lockout.maxAttempts,
        lockMs: this.lockout.lockMs,
        now,
      });
      if (persisted !== null && persisted.lockedUntil !== null) {
        // El intento que dispara el bloqueo ya responde 429, como en el login.
        throw new AppError(429, 'ACCOUNT_LOCKED', ACCOUNT_LOCKED_MESSAGE, {
          retryAfterSeconds: lockoutRetrySeconds(this.lockout),
        });
      }
    }
    throw new AppError(400, 'VALIDATION_ERROR', PAIRING_TOKEN_INVALID_MESSAGE);
  }
}

function buildResponseSenior(
  profile: RedeemSeniorProfile,
  record: PairingTokenRecord,
): RedeemResponseSenior {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: 'SENIOR',
    phone: profile.phone,
    // D11: el familiar dueño sale del token, no del cuerpo.
    caregiverId: record.caregiverId,
    emailVerified: profile.emailVerifiedAt !== null,
    createdAt: profile.createdAt,
    linkStatus: 'LINKED',
    timezone: profile.timezone,
  };
}
