import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { PASSWORD_RULE_MESSAGE, validatePassword } from '../utils/validators';

const TOKEN_ERROR_CODES = new Set([
  'RESET_TOKEN_EXPIRED',
  'RESET_TOKEN_USED',
  'RESET_TOKEN_INVALID',
]);

const MISSING_TOKEN_MESSAGE = 'El enlace no incluye un token válido. Solicita uno nuevo.';

/**
 * HU-004 - Definición de la nueva contraseña.
 * El token llega por la URL (`/reset-password?token=...`), igual que en la web.
 */
export default function ResetPasswordScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = (rawToken ?? '').trim();
  const { logout } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasToken = Boolean(token);

  async function handleSubmit() {
    if (submitting) return;

    setError('');
    setPasswordError('');
    setConfirmError('');

    if (!hasToken) {
      setTokenError(MISSING_TOKEN_MESSAGE);
      return;
    }

    const ruleError = validatePassword(password);
    if (ruleError) {
      setPasswordError(ruleError);
      return;
    }

    if (confirmPassword !== password) {
      setConfirmError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authService.resetPassword(token, password);

      // El cambio incrementa `tokenVersion` en el backend: la sesión actual
      // también queda invalidada, así que se elimina el token local.
      logout();
      setPassword('');
      setConfirmPassword('');
      setSuccess(response.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code && TOKEN_ERROR_CODES.has(err.code)) {
          setTokenError(err.message);
          return;
        }

        if (err.code === 'WEAK_PASSWORD') {
          setPasswordError(err.message);
          return;
        }

        setError(err.message);
        return;
      }

      setError('No pudimos actualizar tu contraseña. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Screen>
        <Card>
          <AppText variant="eyebrow">Contraseña actualizada</AppText>
          <AppText variant="hero" accessibilityRole="header">
            Tu contraseña fue actualizada
          </AppText>

          <Notification type="success">{success}</Notification>

          <AppText variant="muted">
            Por seguridad, cerramos las sesiones anteriores. Inicia sesión con tu nueva
            contraseña.
          </AppText>

          <Link href="/login">
            <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>Iniciar sesión</AppText>
          </Link>
        </Card>
      </Screen>
    );
  }

  if (!hasToken || tokenError) {
    return (
      <Screen>
        <Card>
          <AppText variant="eyebrow">Restablecer contraseña</AppText>
          <AppText variant="hero" accessibilityRole="header">
            No pudimos usar este enlace
          </AppText>

          <Notification type="error">{tokenError || MISSING_TOKEN_MESSAGE}</Notification>

          <AppText variant="muted">
            Solicita un nuevo enlace para definir tu contraseña.
          </AppText>

          <Link href="/forgot-password">
            <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
              Solicitar otro enlace
            </AppText>
          </Link>

          <Link href="/login">
            <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
              Volver a iniciar sesión
            </AppText>
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Restablecer contraseña</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Define tu nueva contraseña
        </AppText>
        <AppText variant="muted">
          La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número.
        </AppText>

        <Notification type="error">{error}</Notification>

        <FormField
          label="Nueva contraseña"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError('');
          }}
          secureTextEntry
          autoComplete="new-password"
          hint={PASSWORD_RULE_MESSAGE}
          editable={!submitting}
          error={passwordError}
        />

        <FormField
          label="Confirmar contraseña"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setConfirmError('');
          }}
          secureTextEntry
          autoComplete="new-password"
          editable={!submitting}
          error={confirmError}
        />

        <Button
          label={submitting ? 'Guardando…' : 'Guardar nueva contraseña'}
          onPress={() => void handleSubmit()}
          loading={submitting}
        />

        <Link href="/login">
          <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
            Volver a iniciar sesión
          </AppText>
        </Link>
      </Card>
    </Screen>
  );
}
