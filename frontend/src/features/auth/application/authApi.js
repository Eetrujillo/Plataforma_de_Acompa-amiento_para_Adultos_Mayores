import { apiClient } from '../../../shared/services/apiClient.js';

export async function loginRequest({ email, password }) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data;
}

export async function registerRequest({ email, password, fullName, phone }) {
  const { data } = await apiClient.post('/auth/register', { email, password, fullName, phone });
  return data.user;
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.user;
}
