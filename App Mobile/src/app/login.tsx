import { Redirect, router, Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LoadingState } from '../components/ui/LoadingState';
import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../hooks/useAuth';
import { useLoginFeedback } from '../hooks/useLoginFeedback';
import { formatWait } from '../utils/time';
import { validateEmail } from '../utils/validators';

/**
 * HU-003 - Inicio de sesión.
 *
 * Equivale a `LoginPage.tsx` + `LoginForm.tsx` de la web:
 * validación local, bloqueo por intentos fallidos con cuenta regresiva y
 * mensajes del backend tal cual los devuelve.
 */
export default function LoginScreen() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { error, retryAfterSeconds, lockedEmail, reportError, clearError } = useLoginFeedback();

  const normalizedEmail = email.trim().toLowerCase();
  const isLockedForEmail = retryAfterSeconds > 0 && lockedEmail === normalizedEmail;
  const visibleError =
    validationError || (lockedEmail && lockedEmail !== normalizedEmail ? '' : error);

  if (loading) return <LoadingState label="Cargando…" />;

  if (user) {
    return <Redirect href={user.emailVerified ? '/panel' : '/verification-required'} />;
  }

  async function handleSubmit() {
    if (isLockedForEmail || submitting) return;

    setValidationError('');
    clearError();

    if (!validateEmail(email)) {
      setValidationError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!password) {
      setValidationError('Ingresa tu contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: normalizedEmail, password });
      router.replace('/panel');
    } catch (err) {
      reportError(err, normalizedEmail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Bienvenido de nuevo</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Iniciar sesión
        </AppText>
        <AppText variant="muted">Accede con el correo y la contraseña de tu cuenta.</AppText>

        <Notification type="error">{visibleError}</Notification>

        {isLockedForEmail ? (
          <Notification type="warning">
            Tiempo restante para volver a intentar: {formatWait(retryAfterSeconds)}
          </Notification>
        ) : null}

        <FormField
          label="Correo electrónico"
          value={email}
          onChangeText={(value) => {
            setValidationError('');
            setEmail(value);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!submitting && !isLockedForEmail}
          returnKeyType="next"
        />

        <FormField
          label="Contraseña"
          value={password}
          onChangeText={(value) => {
            setValidationError('');
            setPassword(value);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!submitting && !isLockedForEmail}
          returnKeyType="go"
          onSubmitEditing={() => void handleSubmit()}
        />

        <Button
          label={
            submitting
              ? 'Ingresando…'
              : isLockedForEmail
                ? `Espera ${formatWait(retryAfterSeconds)}`
                : 'Iniciar sesión'
          }
          onPress={() => void handleSubmit()}
          loading={submitting}
          disabled={isLockedForEmail}
        />

        <View style={styles.links}>
          <Link href="/forgot-password">
            <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
              ¿Olvidaste tu contraseña?
            </AppText>
          </Link>

          <View style={styles.inline}>
            <AppText variant="muted">¿Aún no tienes cuenta? </AppText>
            <Link href="/register">
              <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>Regístrate</AppText>
            </Link>
          </View>

          <Link href="/app/vincular">
            <AppText style={{ color: '#566274', fontWeight: '600' }}>
              Soy adulto mayor y quiero vincular mi app
            </AppText>
          </Link>

          <Link href="/conexion">
            <AppText style={{ color: '#566274', fontWeight: '600' }}>
              Configurar servidor
            </AppText>
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { gap: 10, marginTop: 8 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
