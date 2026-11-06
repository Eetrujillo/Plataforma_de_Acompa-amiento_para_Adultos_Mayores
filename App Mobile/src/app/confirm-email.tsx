import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../hooks/useAuth';
import { useResendVerification } from '../hooks/useResendVerification';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { formatWait } from '../utils/time';
import { EMAIL_INVALID_MESSAGE, validateEmail } from '../utils/validators';

type PageStatus = 'loading' | 'success' | 'error';

/**
 * HU-002 - Confirmación de correo desde el enlace.
 *
 * El token llega en la URL. Se intenta una sola vez para no repetir la llamada
 * si la pantalla se vuelve a renderizar.
 */
export default function ConfirmEmailScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = (rawToken ?? '').trim();
  const { user, refreshUser } = useAuth();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [message, setMessage] = useState('Estamos confirmando tu correo…');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const attemptedToken = useRef<string | null>(null);
  const {
    resend,
    resending,
    message: resendMessage,
    error: resendError,
    retryAfterSeconds,
  } = useResendVerification();

  useEffect(() => {
    if (attemptedToken.current === token) return;
    attemptedToken.current = token;

    if (!token) {
      setStatus('error');
      setMessage('El enlace no incluye un token válido. Solicita uno nuevo.');
      return;
    }

    authService
      .verifyEmail(token)
      .then((response) => {
        setStatus('success');
        setMessage(response.message);

        if (authService.hasToken()) {
          void refreshUser();
        }
      })
      .catch((err) => {
        setStatus('error');
        if (err instanceof ApiError) {
          setMessage(err.message);
        } else {
          setMessage('No pudimos confirmar tu correo. Inténtalo de nuevo.');
        }
      });
  }, [token, refreshUser]);

  async function handleResend() {
    if (!validateEmail(email)) {
      setEmailError(EMAIL_INVALID_MESSAGE);
      return;
    }

    if (resending || retryAfterSeconds > 0) return;

    await resend(email.trim().toLowerCase());
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Confirmación de correo</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Confirmar mi correo
        </AppText>

        {status === 'loading' ? (
          <AppText variant="muted" accessibilityLiveRegion="polite">
            {message}
          </AppText>
        ) : null}

        {status === 'success' ? (
          <>
            <Notification type="success">{message}</Notification>
            <AppText variant="muted">Ya puedes usar tu cuenta con normalidad.</AppText>
            <Link href={user ? '/panel' : '/login'}>
              <AppText style={{ color: '#1f4e8c', fontWeight: '800' }}>
                {user ? 'Ir al panel' : 'Ir a iniciar sesión'}
              </AppText>
            </Link>
          </>
        ) : null}

        {status === 'error' ? (
          <>
            <Notification type="error">{message}</Notification>

            <AppText variant="muted">Solicita un nuevo enlace de confirmación.</AppText>

            <FormField
              label="Correo electrónico"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setEmailError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              error={emailError}
              editable={!resending}
            />

            <Button
              label={
                resending
                  ? 'Enviando…'
                  : retryAfterSeconds > 0
                    ? `Espera ${formatWait(retryAfterSeconds)}`
                    : 'Solicitar nuevo enlace'
              }
              onPress={() => void handleResend()}
              loading={resending}
              disabled={retryAfterSeconds > 0}
            />

            <Notification type="success">{resendMessage}</Notification>
            <Notification type="error">{resendError}</Notification>

            <Link href={user ? '/verification-required' : '/login'}>
              <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
                {user ? 'Volver a mi cuenta' : 'Volver a iniciar sesión'}
              </AppText>
            </Link>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
