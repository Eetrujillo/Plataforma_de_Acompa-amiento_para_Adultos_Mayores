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

/**
 * Pide el enlace de restablecimiento. La respuesta es la misma exista o no la cuenta,
 * así que la pantalla no puede prometer nada sobre la existencia del correo.
 */
export async function requestPasswordResetRequest(email) {
  const { data } = await apiClient.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPasswordRequest(token, password) {
  const { data } = await apiClient.post('/auth/reset-password', { token, password });
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.user;
}

/**
 * Runtime Google client config. The client id is never baked into the build.
 * A missing or failing config simply means Google is not available yet.
 */
export async function fetchGoogleConfig() {
  const { data } = await apiClient.get('/auth/google/config');
  return data;
}

/**
 * Signs in an existing account with the id_token issued by Google Identity Services.
 * The backend only authenticates accounts that already exist: it never creates one.
 */
export async function googleLoginRequest(idToken) {
  const { data } = await apiClient.post('/auth/google', { idToken });
  return data;
}
