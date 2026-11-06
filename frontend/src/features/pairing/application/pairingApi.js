import { apiClient } from '../../../shared/services/apiClient.js';

// HU-006 S3: el código pertenece a un perfil concreto, así que `seniorId` viaja siempre en el
// cuerpo. El backend responde 400 SENIOR_ID_REQUIRED si falta y 409 SENIOR_ALREADY_LINKED si el
// perfil ya está vinculado; ambos mensajes llegan traducidos por `apiClient`.
export async function createPairingCode({ seniorId } = {}) {
  const { data } = await apiClient.post('/pairing/codes', { seniorId });
  return data;
}

export async function listLinkedSeniors() {
  const { data } = await apiClient.get('/pairing/seniors');
  return data.seniors;
}

export async function linkSenior({ code, fullName, phone }) {
  const { data } = await apiClient.post('/pairing/link', { code, fullName, phone });
  return data;
}
