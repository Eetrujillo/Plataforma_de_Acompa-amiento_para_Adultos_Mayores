import { apiClient } from '../../../shared/services/apiClient.js';

export async function loginRequest({ email, password }) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data;
}

export async function registerRequest({ email, password, fullName, phone, acceptedTerms }) {
  // `acceptedTerms` must travel as a real boolean: the backend rejects anything else
  // because Ley 1581 requires prior, express and informed consent.
  const { data } = await apiClient.post('/auth/register', {
    email,
    password,
    fullName,
    phone,
    acceptedTerms
  });
  return data;
}

export async function verifyEmailRequest(token) {
  const { data } = await apiClient.post('/auth/verify-email', { token });
  return data;
}

export async function resendVerificationRequest(email) {
  const { data } = await apiClient.post('/auth/resend-verification', { email });
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.user;
}
