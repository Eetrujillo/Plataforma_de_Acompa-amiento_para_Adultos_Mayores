import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../hooks/useAuth';
import { useResendVerification } from '../hooks/useResendVerification';
import { setToken } from '../services/apiClient';
import { authService } from '../services/authService';
import { formatWait } from '../utils/time';

/**
 * HU-002 - Acceso limitado mientras el correo no esté confirmado.
 *
 * En la web se refrescaba al volver a la pestaña (`focus`). En móvil el
 * equivalente es `AppState` en estado `active`.
 */
export default function VerificationRequiredScreen() {
  const { user, logout, refreshUser, loading } = useAuth();
  const { resend, resending, message, error, retryAfterSeconds } = useResendVerification();
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState('');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshUser();
    });

    return () => subscription.remove();
  }, [refreshUser]);

  if (loading) return <LoadingState label="Cargando…" />;
  if (!user) return <Redirect href="/login" />;
  if (user.emailVerified) return <Redirect href="/panel" />;

  async function handleLogout() {
    logout();
    router.replace('/login');
  }

  async function handleResend() {
    if (!user || resending || retryAfterSeconds > 0) return;
    await resend(user.email);
  }

  /**
   * Atajo de desarrollo: sin SMTP el enlace solo se imprime en la consola del
   * backend, así que desde un teléfono no habría forma de confirmar la cuenta.
   * El botón solo aparece en `__DEV__` y la ruta no existe en producción.
   */
  async function handleDevConfirm() {
    if (!user || devBusy) return;

    setDevBusy(true);
    setDevError('');

    try {
      const response = await authService.devVerifyEmail(user.email);
      setToken(response.token);
      // `refreshUser` actualiza el contexto y la pantalla redirige sola.
      await refreshUser();
    } catch {
      setDevError('No se pudo confirmar en modo desarrollo. Revisa el servidor.');
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Acceso limitado</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Confirma tu correo para continuar
        </AppText>

        <Notification type="warning">
          Por seguridad, las funciones de la plataforma están restringidas hasta que confirmes
          tu correo electrónico. Así protegemos la información del adulto mayor y de su
          familia.
        </Notification>

        <AppText variant="muted">
          El enlace de confirmación se envía a <AppText style={{ fontWeight: '800' }}>{user.email}</AppText>.
          Revisa tu bandeja de entrada y la carpeta de spam.
        </AppText>

        <Button
          label={
            resending
              ? 'Enviando…'
              : retryAfterSeconds > 0
                ? `Espera ${formatWait(retryAfterSeconds)}`
                : 'Reenviar correo de confirmación'
          }
          onPress={() => void handleResend()}
          loading={resending}
          disabled={retryAfterSeconds > 0}
        />

        <Notification type="success">{message}</Notification>
        <Notification type="error">{error}</Notification>

        <Button
          label="Ya confirmé, actualizar estado"
          variant="secondary"
          onPress={() => void refreshUser()}
        />

        {__DEV__ ? (
          <>
            <Button
              label={devBusy ? 'Confirmando…' : 'Confirmar correo ahora (desarrollo)'}
              variant="secondary"
              onPress={() => void handleDevConfirm()}
              loading={devBusy}
            />
            <Notification type="error">{devError}</Notification>
          </>
        ) : null}

        <Button label="Cerrar sesión" variant="ghost" onPress={handleLogout} />
      </Card>
    </Screen>
  );
}
