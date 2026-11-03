import { apiClient } from '../../../shared/services/apiClient.js';

export async function createPairingCode() {
  const { data } = await apiClient.post('/pairing/codes');
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
