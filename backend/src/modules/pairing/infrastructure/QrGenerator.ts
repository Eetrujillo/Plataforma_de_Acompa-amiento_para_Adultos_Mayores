import QRCode from 'qrcode';

import { AppError } from '../../../shared/errors/AppError.ts';
import type { PairingQrEncoderPort } from '../application/PairingQrEncoderPort.ts';
import { PAIRING_QR_UNAVAILABLE_MESSAGE } from '../application/pairingMessages.ts';

/** La imagen del QR: 320 px de ancho con margen 1 y corrección `M` (S20). */
const QR_WIDTH_PX = 320;
const QR_MARGIN_MODULES = 1;
const QR_ERROR_CORRECTION = 'M' as const;

/**
 * S4/D9: cualquier excepción del codificador se traduce a
 * `AppError(503, 'PAIRING_QR_UNAVAILABLE')` acá — una sola vez, fuera del caso
 * de uso. Sin imagen no hay credencial: tampoco se toca la base, porque el
 * caso de uso codifica antes de persistir (S13/S17).
 */
export async function renderPngDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      type: 'image/png',
      width: QR_WIDTH_PX,
      margin: QR_MARGIN_MODULES,
      errorCorrectionLevel: QR_ERROR_CORRECTION,
    });
  } catch (cause: unknown) {
    throw new AppError(503, 'PAIRING_QR_UNAVAILABLE', PAIRING_QR_UNAVAILABLE_MESSAGE, {
      cause: cause instanceof Error ? cause.name : String(cause),
    });
  }
}

/** El puerto del caso de uso lo satisface el codificador real de `qrcode`. */
export function createPairingQrEncoder(): PairingQrEncoderPort {
  return { toDataUrl: renderPngDataUrl };
}
