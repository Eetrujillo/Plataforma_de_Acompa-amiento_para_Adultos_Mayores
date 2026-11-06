import { apiClient } from '../../../shared/services/apiClient.js';

export async function createSeniorProfile({ fullName, pin, timezone }) {
  const { data } = await apiClient.post('/seniors', { fullName, pin, timezone });
  return data;
}

export async function listSeniorProfiles() {
  const { data } = await apiClient.get('/seniors');
  return data.seniors;
}

export async function getSeniorProfile(seniorId) {
  const { data } = await apiClient.get(`/seniors/${seniorId}`);
  return data;
}
