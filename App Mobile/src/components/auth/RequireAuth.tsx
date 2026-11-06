import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { olderAdultAppService } from '../../services/olderAdultAppService';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState } from '../ui/LoadingState';

/**
 * Protección de rutas del familiar.
 *
 * Reemplaza a `ProtectedRoute.tsx` de la web:
 * - Sin sesión → `/login`.
 * - Con correo sin confirmar → `/verification-required`.
 */
export function RequireFamily({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState label="Cargando sesión…" />;
  if (!user) return <Redirect href="/login" />;
  if (!user.emailVerified) return <Redirect href="/verification-required" />;

  return <>{children}</>;
}

/**
 * Protección de la app del adulto mayor.
 *
 * Usa el token `X-Older-Adult-Token`, no el JWT del familiar. Sin token se
 * vuelve a la pantalla de vinculación.
 */
export function RequireSenior({ children }: { children: ReactNode }) {
  if (!olderAdultAppService.hasToken()) return <Redirect href="/app/vincular" />;

  return <>{children}</>;
}
