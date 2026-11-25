/**
 * HU-008 / D9 — puerto del codificador del QR. El adaptador (QrGenerator)
 * traduce cualquier excepción del codificador a `AppError(503,
 * 'PAIRING_QR_UNAVAILABLE')`: así S4 es observable con un doble que falla y el
 * caso de uso no lleva `try/catch` sueltos.
 */
export interface PairingQrEncoderPort {
  /**
   * Codifica el payload EXACTO del sobre (`buildPairingQrPayload`) en una
   * imagen PNG data URL que el panel puede renderizar.
   */
  toDataUrl(payload: string): Promise<string>;
}
