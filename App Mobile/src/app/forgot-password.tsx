import { Link } from 'expo-router';
import { useState } from 'react';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { EMAIL_INVALID_MESSAGE, validateEmail } from '../utils/validators';

/**
 * HU-004 - Solicitud de recuperación de contraseña.
 * El backend responde igual exista o no la cuenta, para no filtrar correos.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;

    setError('');
    setMessage('');

    if (!validateEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const response = await authService.requestPasswordReset(email.trim().toLowerCase());
      setMessage(response.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos enviar la solicitud. Inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Recuperar contraseña</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Recuperar mi contraseña
        </AppText>
        <AppText variant="muted">
          Escribe el correo de tu cuenta y te enviaremos un enlace para definir una nueva
          contraseña.
        </AppText>

        <Notification type="error">{error}</Notification>
        <Notification type="success">{message}</Notification>

        <FormField
          label="Correo electrónico"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!submitting}
          returnKeyType="send"
          onSubmitEditing={() => void handleSubmit()}
        />

        <Button
          label={submitting ? 'Enviando…' : 'Enviar enlace'}
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
