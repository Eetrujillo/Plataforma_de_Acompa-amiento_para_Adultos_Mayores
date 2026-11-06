import { Redirect } from 'expo-router';

import { LoadingState } from '../components/ui/LoadingState';
import { useAuth } from '../hooks/useAuth';

/**
 * Puerta de entrada.
 *
 * Decide a dónde ir sin parpadeos:
 * - Cargando la sesión → indicador.
 * - Sin cuenta → login.
 * - Cuenta sin confirmar → pantalla de confirmación.
 * - Cuenta lista → panel del familiar.
 */
export default function IndexScreen() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState label="Revisando tu sesión…" />;

  if (!user) return <Redirect href="/login" />;
  if (!user.emailVerified) return <Redirect href="/verification-required" />;

  return <Redirect href="/panel" />;
}
