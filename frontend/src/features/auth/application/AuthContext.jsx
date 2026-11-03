import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { clearSession, readSession, writeSession } from '../../../shared/services/sessionToken.js';
import { loginRequest } from './authApi.js';

const AuthContext = createContext(null);

/**
 * Session provider: single source of truth for the current user and token.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const startSession = useCallback((nextSession) => {
    writeSession(nextSession);
    setSession(nextSession);
    setError(null);
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      setPending(true);
      setError(null);

      try {
        const result = await loginRequest({ email, password });
        startSession(result);
        return true;
      } catch (caught) {
        setError(caught.message);
        return false;
      } finally {
        setPending(false);
      }
    },
    [startSession]
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      token: session?.token ?? null,
      user: session?.user ?? null,
      role: session?.user?.role ?? null,
      pending,
      error,
      login,
      logout,
      startSession
    }),
    [session, pending, error, login, logout, startSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }

  return context;
}
