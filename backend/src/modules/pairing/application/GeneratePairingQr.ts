/**
 * HU-008 / T4 — emisión del QR de vinculación. El orden de S17 vive acá, no en
 * el controlador ni en el adaptador: validar el perfil → generar el token →
 * codificar el QR → invalidar los anteriores → reiniciar el bloqueo del canje
 * (D14.1) → persistir el hash.
 */
import { AppError } from '../../../shared/errors/AppError.ts';
import { isObjectIdHex } from '../../seniors/domain/seniorLink.ts';
import { seniorNotFoundError } from '../../seniors/application/loadAccessibleSenior.ts';
import { buildPairingQrPayload, generatePairingToken, hashPairingToken } from '../domain/pairingToken.ts';
import {
  PAIRING_QR_UNAVAILABLE_MESSAGE,
  SENIOR_ALREADY_LINKED_MESSAGE,
  SENIOR_ID_REQUIRED_MESSAGE,
} from './pairingMessages.ts';
import type { SeniorProfileReaderPort } from './SeniorProfileReaderPort.ts';
import type { PairingLockoutPort } from './PairingLockoutPort.ts';
import type {
  PairingTokenRepositoryPort,
} from './PairingTokenRepositoryPort.ts';
import type { PairingQrEncoderPort } from './PairingQrEncoderPort.ts';

// S12/D8: los mensajes viven en `pairingMessages.ts` y se reexportan acá para
// que los tests del caso de uso no dependan de la ruta interna.
export {
  PAIRING_QR_UNAVAILABLE_MESSAGE,
  SENIOR_ALREADY_LINKED_MESSAGE,
  SENIOR_ID_REQUIRED_MESSAGE,
};

/** Lo que la emisión entrega al controlador: NUNCA incluye el token (S6/S11). */
export interface PairingQrResult {
  readonly seniorId: string;
  readonly expiresAt: Date;
  readonly qrCodeDataUrl: string;
}

/** El caregiverId sale de la sesión, nunca del cuerpo (skill pairing-generator §6). */
export interface GeneratePairingQrCommand {
  readonly seniorId: string;
  readonly caregiverId: string;
}

/**
 * S1: genera un QR de un solo uso con 24 horas de vigencia (S14), sólo para
 * perfiles pendientes (S3/S18) y del familiar de la sesión (S8). Un fallo del
 * codificador no toca la base (S13); un fallo de la escritura deja el QR
 * anterior ya inválido (S15, falla cerrado). Emitir es además el escape
 * documentado del bloqueo de canje (D14.1): el mismo flujo de emisión
 * reinicia la racha y el `lockedUntil` del perfil, y lo hace DESPUÉS de
 * codificar el QR, así que un 503 no toca nada del bloqueo.
 *
 * Por el advisory `R4-2` la emisión depende de `PairingLockoutPort`, no del
 * escritor del vínculo del canje: reiniciar una racha es lo único que necesita
 * del documento del adulto mayor.
 */
export class GeneratePairingQr {
  private readonly seniorReader: SeniorProfileReaderPort;
  private readonly pairingTokenRepository: PairingTokenRepositoryPort;
  private readonly qrEncoder: PairingQrEncoderPort;
  /** D14.1: el puerto del bloqueo del canje, no el escritor del vínculo. */
  private readonly lockout: PairingLockoutPort;
  private readonly clock: () => Date;
  private readonly ttlMinutes: number;

  constructor(deps: {
    seniorReader: SeniorProfileReaderPort;
    pairingTokenRepository: PairingTokenRepositoryPort;
    qrEncoder: PairingQrEncoderPort;
    /** D14.1: el puerto del bloqueo del canje del slice (D8), no uno nuevo. */
    lockout: PairingLockoutPort;
    clock: () => Date;
    /** TTL del token en minutos: la config (`PAIRING_TTL_MINUTES`), no un valor fijo. */
    ttlMinutes: number;
  }) {
    this.seniorReader = deps.seniorReader;
    this.pairingTokenRepository = deps.pairingTokenRepository;
    this.qrEncoder = deps.qrEncoder;
    this.lockout = deps.lockout;
    this.clock = deps.clock;
    this.ttlMinutes = deps.ttlMinutes;
  }

  async execute(command: GeneratePairingQrCommand): Promise<PairingQrResult> {
    // S12: falta `seniorId` o no tiene forma de id de Mongo → 400 ANTES de
    // tocar la persistencia (un ObjectId inválido sería un 500 del driver).
    if (!isObjectIdHex(command.seniorId)) {
      throw new AppError(400, 'SENIOR_ID_REQUIRED', SENIOR_ID_REQUIRED_MESSAGE);
    }
    // 1. El perfil existe, es del cuidador de la sesión y sigue pendiente.
    const senior = await this.seniorReader.findSeniorForCaregiver(
      command.seniorId,
      command.caregiverId,
    );
    if (senior === null) throw seniorNotFoundError();
    // S3/S18: vinculado, o anterior a HU-005 sin `linkStatus`, → 409.
    if (senior.linkStatus !== 'PENDING') {
      throw new AppError(409, 'SENIOR_ALREADY_LINKED', SENIOR_ALREADY_LINKED_MESSAGE);
    }
    // 2. Se genera el token…
    const token = generatePairingToken();
    // 3. …y se codifica el QR ANTES de tocar la base (S13): el pedido se arma
    // completo, así que un 503 deja el QR anterior vigente y se puede reintentar.
    // El adaptador traduce cualquier fallo del codificador al 503 (D9). Si el
    // codificador igual resuelve una cadena vacía (o algo que no es texto),
    // tampoco hay imagen que mostrar: el mismo 503 sin tocar la base (S13).
    const payload = buildPairingQrPayload(token);
    const qrCodeDataUrl = await this.qrEncoder.toDataUrl(payload);
    if (typeof qrCodeDataUrl !== 'string' || qrCodeDataUrl === '') {
      throw new AppError(503, 'PAIRING_QR_UNAVAILABLE', PAIRING_QR_UNAVAILABLE_MESSAGE);
    }
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000);
    // 4. Los anteriores no usados del perfil quedan reemplazados (S15/S7).
    await this.pairingTokenRepository.invalidateUnusedForSenior(command.seniorId, now);
    // 5. D14.1: emitir es el acto deliberado del familiar y ya era la salida
    // documentada («el familiar emite otro QR»): la MISMA emisión reinicia la
    // racha y el bloqueo de canje de ese perfil, para que el QR nuevo no
    // conteste 429. Va después del QR codificado (S13: el 503 de un codificador
    // caído no tocó nada) y reusa `clearRedeemFailures` del puerto del bloqueo.
    await this.lockout.clearRedeemFailures(command.seniorId);
    // 6. Se persiste el HASH con el vencimiento (S5). Si falla acá, los
    // anteriores ya quedaron inválidos: falla cerrado, sin QR vivo.
    await this.pairingTokenRepository.create({
      seniorId: command.seniorId,
      caregiverId: command.caregiverId,
      tokenHash: hashPairingToken(token),
      expiresAt,
    });
    return { seniorId: command.seniorId, expiresAt, qrCodeDataUrl };
  }
}
