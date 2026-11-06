import { apiClient, getToken, setToken } from './apiClient';
import type {
  AuthResponse,
  ForgotPasswordResponse,
  LoginPayload,
  RegisterPayload,
  ResendVerificationResponse,
  ResetPasswordResponse,
  User,
  VerifyEmailResponse,
} from '../types';

/**
 * Autenticación del familiar.
 * El token se guarda vía `apiClient`, que lo mantiene en memoria y en
 * `AsyncStorage`. En web, AsyncStorage usa `localStorage` por debajo.
 */
export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const data = await apiClient.post<AuthResponse>('/auth/login', payload);
    setToken(data.token);
    return data;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const data = await apiClient.post<AuthResponse>('/auth/register', payload);
    setToken(data.token);
    return data;
  },

  me: (): Promise<User> => apiClient.get<User>('/auth/me'),

  verifyEmail: (token: string): Promise<VerifyEmailResponse> =>
    apiClient.post<VerifyEmailResponse>('/auth/verify-email', { token }),

  resendVerification: (email: string): Promise<ResendVerificationResponse> =>
    apiClient.post<ResendVerificationResponse>('/auth/resend-verification', { email }),

  requestPasswordReset: (email: string): Promise<ForgotPasswordResponse> =>
    apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string): Promise<ResetPasswordResponse> =>
    apiClient.post<ResetPasswordResponse>('/auth/reset-password', { token, password }),

  /**
   * Solo desarrollo: confirma el correo sin abrir el enlace del mensaje.
   * La ruta no existe cuando el backend corre con NODE_ENV=production.
   */
  devVerifyEmail: (email: string): Promise<AuthResponse> =>
    apiClient.post<AuthResponse>('/auth/dev/verify-email', { email }),

  logout: (): void => setToken(null),

  hasToken: (): boolean => Boolean(getToken()),
};
