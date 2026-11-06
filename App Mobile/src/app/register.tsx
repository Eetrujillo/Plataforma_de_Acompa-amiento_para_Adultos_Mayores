import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/apiClient';
import {
  EMAIL_INVALID_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  PRIVACY_REQUIRED_MESSAGE,
  validateEmail,
  validatePassword,
} from '../utils/validators';

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  privacy?: string;
  form?: string;
}

const EMAIL_EXISTS_MESSAGE = 'Este correo ya tiene una cuenta';

/**
 * HU-001 - Registro de familiar.
 *
 * Mismos códigos de error que la web (`EMAIL_ALREADY_EXISTS`, `INVALID_EMAIL`,
 * `WEAK_PASSWORD`, `PRIVACY_NOT_ACCEPTED`) para mostrar el mensaje en el campo
 * correcto.
 */
export default function RegisterScreen() {
  const { user, loading, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [existingEmail, setExistingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingState label="Cargando…" />;

  if (user) {
    return <Redirect href={user.emailVerified ? '/panel' : '/verification-required'} />;
  }

  async function handleSubmit() {
    if (submitting) return;

    const nextErrors: FormErrors = {};

    if (!name.trim() || name.trim().length < 3) {
      nextErrors.name = 'Ingresa tu nombre completo.';
    }

    if (!validateEmail(email)) nextErrors.email = EMAIL_INVALID_MESSAGE;

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;

    if (!acceptedPrivacy) nextErrors.privacy = PRIVACY_REQUIRED_MESSAGE;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setExistingEmail(false);
      return;
    }

    setErrors({});
    setExistingEmail(false);
    setSubmitting(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        acceptPrivacyPolicy: true,
      });
      // La cuenta nace sin confirmar: la app debe mostrar la pantalla de
      // verificación, no el panel (las rutas protegidas lo exigen igual).
      router.replace('/verification-required');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_ALREADY_EXISTS') {
          setExistingEmail(true);
        } else if (err.code === 'INVALID_EMAIL') {
          setErrors({ email: EMAIL_INVALID_MESSAGE });
        } else if (err.code === 'WEAK_PASSWORD') {
          setErrors({ password: PASSWORD_RULE_MESSAGE });
        } else if (err.code === 'PRIVACY_NOT_ACCEPTED') {
          setErrors({ privacy: PRIVACY_REQUIRED_MESSAGE });
        } else {
          setErrors({ form: err.message });
        }
        return;
      }

      setErrors({
        form:
          err instanceof Error
            ? err.message
            : 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Crea tu cuenta</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Registro de familiar
        </AppText>
        <AppText variant="muted">
          Crea tu cuenta para acompañar y gestionar las actividades de tu familiar.
        </AppText>

        {existingEmail ? (
          <Notification type="error">
            {EMAIL_EXISTS_MESSAGE}. <Link href="/login">Inicia sesión</Link>
          </Notification>
        ) : null}

        {errors.form ? <Notification type="error">{errors.form}</Notification> : null}

        <FormField
          label="Nombre completo"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined, form: undefined }));
          }}
          autoComplete="name"
          editable={!submitting}
          error={errors.name}
        />

        <FormField
          label="Correo electrónico"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined, form: undefined }));
            setExistingEmail(false);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!submitting}
          error={errors.email}
        />

        <FormField
          label="Contraseña"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined, form: undefined }));
          }}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          hint={PASSWORD_RULE_MESSAGE}
          editable={!submitting}
          error={errors.password}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedPrivacy }}
          onPress={() => {
            setAcceptedPrivacy((current) => !current);
            setErrors((current) => ({ ...current, privacy: undefined, form: undefined }));
          }}
          style={styles.checkRow}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: errors.privacy ? '#b23b3b' : '#566274',
                backgroundColor: acceptedPrivacy ? '#1f4e8c' : '#ffffff',
              },
            ]}
          >
            <AppText style={{ color: '#ffffff', fontWeight: '800' }}>
              {acceptedPrivacy ? '✓' : ''}
            </AppText>
          </View>
          <AppText variant="muted" style={styles.checkLabel}>
            Acepto la política de privacidad y el tratamiento de datos.
          </AppText>
        </Pressable>

        <Link href="/privacy">
          <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>
            Leer la política (versión 1.0)
          </AppText>
        </Link>

        {errors.privacy ? (
          <AppText
            accessibilityLiveRegion="polite"
            style={{ color: '#8a1c1c', fontSize: 16, fontWeight: '700' }}
          >
            {errors.privacy}
          </AppText>
        ) : null}

        <Button
          label={submitting ? 'Creando cuenta…' : 'Crear cuenta'}
          onPress={() => void handleSubmit()}
          loading={submitting}
        />

        <View style={styles.inline}>
          <AppText variant="muted">¿Ya tienes cuenta? </AppText>
          <Link href="/login">
            <AppText style={{ color: '#1f4e8c', fontWeight: '700' }}>Inicia sesión</AppText>
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { flex: 1 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
