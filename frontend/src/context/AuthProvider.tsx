import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginPayload, RegisterPayload, User } from '../types';
import { ApiError, SESSION_EXPIRED_EVENT } from '../services/apiClient';
import { authService } from '../services/authService';

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
