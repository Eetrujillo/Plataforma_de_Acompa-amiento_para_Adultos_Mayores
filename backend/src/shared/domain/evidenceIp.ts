import { isIP } from 'node:net';

/**
 * La evidencia de la Ley 1581 no puede guardar lo que el cliente escriba en un
 * header: con proxies confiables de más, `req.ip` puede traer texto arbitrario.
 * Sólo se registra cuando es una dirección IP válida. Compartida por el
 * registro del familiar (HU-001, `AuthController`) y el canje del QR
 * (HU-009, `PairingController`) — una sola implementación, dos llamadores.
 */
export function evidenceIp(raw: string | undefined): string | undefined {
  const candidate = raw?.trim();
  if (candidate === undefined || candidate === '') return undefined;
  return isIP(candidate) === 0 ? undefined : candidate;
}
