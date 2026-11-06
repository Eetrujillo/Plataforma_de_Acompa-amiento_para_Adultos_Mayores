import { apiClient } from '../../../shared/services/apiClient.js';

/**
 * HU-006 (rework QR-only de L9): el QR es la credencial y la única vía de vinculación.
 *
 * El token opaco viaja únicamente dentro de la imagen que devuelve `generatePairingQr`; el
 * backend no lo repite en el cuerpo. Por eso no hay acá ninguna función que lea un código de una
 * pantalla ni que lo canjee a mano: el canje lo hace el escáner del teléfono del adulto mayor
 * (HU-007) con `redeemPairingToken`.
 */

// El QR pertenece a un perfil concreto, así que `seniorId` viaja siempre en el cuerpo. El backend
// responde 400 SENIOR_ID_REQUIRED si falta, 409 SENIOR_ALREADY_LINKED si el perfil ya está
// vinculado y 503 PAIRING_QR_UNAVAILABLE si no pudo dibujar la imagen; los mensajes llegan
// traducidos por `apiClient`.
export async function generatePairingQr({ seniorId } = {}) {
  const { data } = await apiClient.post('/pairing/qr', { seniorId });
  return data;
}

// Público: el teléfono del adulto mayor todavía no tiene sesión, el token escaneado es su
// credencial. Devuelve `{ token, senior }` con el JWT del perfil recién vinculado.
export async function redeemPairingToken({ token } = {}) {
  const { data } = await apiClient.post('/pairing/redeem', { token });
  return data;
}

export async function listLinkedSeniors() {
  const { data } = await apiClient.get('/pairing/seniors');
  return data.seniors;
}
