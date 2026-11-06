import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError } from '../services/apiClient';
import { appEvents } from '../services/events';
import { authService } from '../services/authService';
import type { LoginPayload, RegisterPayload, User } from '../types';

/**
 * Sesión del familiar.
 *
 * Igual que en la web: restaura la sesión con `/auth/me`, guarda el usuario en
 * contexto y expone `login`, `register`, `logout` y `refreshUser`.
 * La diferencia es que el token vive en `AsyncStorage`, hidratado antes de que
 * este provider se monte (ver `app/_layout.tsx`).
 */

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
        // Un token viejo no debe dejar la app en "cargando" para siempre.
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

  useEffect(
    () =>
      appEvents.onSessionExpired(() => {
        // No se cierra la sesión aquí: se muestra el modal para no perder el
        // formulario que el usuario estaba llenando (comportamiento de la web).
        setSessionExpired(true);
      }),
    []
  );

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
