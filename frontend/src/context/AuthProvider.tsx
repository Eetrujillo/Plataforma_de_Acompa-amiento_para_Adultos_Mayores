import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginPayload, RegisterPayload, User } from '../types';
import { ApiError, SESSION_EXPIRED_EVENT } from '../services/apiClient';
import { authService } from '../services/authService';

const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === 'true';

/**
 * Usuario mock para pruebas sin autenticación.
 * Se usa solo cuando VITE_DISABLE_AUTH=true.
 */
function getMockUser(): User {
  return {
    _id: '000000000000000000000000',
    name: 'Usuario Demo',
    email: 'demo@local.test',
    role: 'familiar',
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    privacyPolicy: { acceptedAt: new Date().toISOString(), version: '1' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  welcomePending: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  consumeWelcome: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const userRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    // Modo prueba: auto-login con usuario mock
    if (DISABLE_AUTH) {
      const mockUser = getMockUser();
      setUser(mockUser);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    if (!authService.hasToken()) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const requestId = ++userRequestRef.current;

    authService
      .me()
      .then((currentUser) => {
        if (active && requestId === userRequestRef.current) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (active && requestId === userRequestRef.current) {
          authService.logout();
          setUser(null);
          setSessionExpired(false);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // En modo prueba no escuchamos eventos de expiración
    if (DISABLE_AUTH) return;

    function handleSessionExpired() {
      setSessionExpired(true);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { user: currentUser } = await authService.login(payload);
    userRequestRef.current += 1;
    setWelcomePending(false);
    setSessionExpired(false);
    setUser(currentUser);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { user: currentUser } = await authService.register(payload);
    userRequestRef.current += 1;
    setWelcomePending(true);
    setSessionExpired(false);
    setUser(currentUser);
  }, []);

  const logout = useCallback(() => {
    userRequestRef.current += 1;
    authService.logout();
    setWelcomePending(false);
    setSessionExpired(false);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    // En modo prueba no hacemos refresh real
    if (DISABLE_AUTH) return;

    if (!authService.hasToken()) return;

    const requestId = ++userRequestRef.current;

    try {
      const currentUser = await authService.me();
      if (requestId === userRequestRef.current) {
        setUser(currentUser);
      }
    } catch (err) {
      if (requestId !== userRequestRef.current) return;

      if (err instanceof ApiError && err.status === 401) {
        // La sesión venció mientras el panel seguía abierto. No desmontamos
        // la página para conservar el formulario que el usuario estaba llenando.
        setSessionExpired(true);
      }
    }
  }, []);

  const consumeWelcome = useCallback(() => {
    setWelcomePending(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionExpired,
      welcomePending,
      login,
      register,
      logout,
      refreshUser,
      consumeWelcome,
    }),
    [
      user,
      loading,
      sessionExpired,
      welcomePending,
      login,
      register,
      logout,
      refreshUser,
      consumeWelcome,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
