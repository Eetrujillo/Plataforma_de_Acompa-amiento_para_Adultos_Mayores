import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { cardShadow } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../hooks/useAuth';
import { useLoginFeedback } from '../../hooks/useLoginFeedback';
import { formatWait } from '../../utils/time';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Notification } from '../ui/Notification';

/**
 * Sesión vencida sin perder el trabajo en curso.
 *
 * Cuando el backend responde 401, la web mostraba este modal en lugar de
 * desmontar la pantalla. Se conserva porque el familiar puede estar a mitad de
 * una actividad y no debe perder lo escrito.
 */
export function SessionExpiredModal() {
  const theme = useTheme();
  const { user, sessionExpired, login, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { error, retryAfterSeconds, lockedEmail, reportError, clearError } = useLoginFeedback();

  useEffect(() => {
    if (!sessionExpired) return;
    setPassword('');
    setValidationError('');
    clearError();
  }, [sessionExpired, clearError]);

  if (!sessionExpired || !user) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const isLocked = retryAfterSeconds > 0 && lockedEmail === normalizedEmail;
  const visibleError = validationError || error;

  async function handleSubmit() {
    if (isLocked || submitting) return;

    setValidationError('');
    clearError();

    if (!password) {
      setValidationError('Ingresa tu contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: normalizedEmail, password });
      setPassword('');
    } catch (err) {
      reportError(err, normalizedEmail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            cardShadow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.card,
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
            },
          ]}
        >
          <AppText variant="eyebrow">Sesión vencida</AppText>
          <AppText variant="title" style={{ fontSize: theme.font.title * 0.82 }}>
            Ingresa de nuevo para continuar
          </AppText>
          <AppText variant="muted">
            Por seguridad, tu sesión venció. El formulario que estabas llenando se conserva.
          </AppText>

          <AppText variant="muted">
            Cuenta: <AppText style={{ fontWeight: '800' }}>{user.email}</AppText>
          </AppText>

          <Notification type="error">{visibleError}</Notification>

          {isLocked ? (
            <Notification type="warning">
              Tiempo restante para volver a intentar: {formatWait(retryAfterSeconds)}
            </Notification>
          ) : null}

          <FormField
            label="Contraseña"
            value={password}
            onChangeText={(value) => {
              setValidationError('');
              setPassword(value);
            }}
            secureTextEntry
            autoComplete="current-password"
            editable={!submitting && !isLocked}
            onSubmitEditing={() => void handleSubmit()}
            returnKeyType="go"
          />

          <Button
            label={
              submitting
                ? 'Ingresando…'
                : isLocked
                  ? `Espera ${formatWait(retryAfterSeconds)}`
                  : 'Ingresar de nuevo'
            }
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={isLocked}
          />

          <Button label="Cerrar sesión e ir al inicio" variant="secondary" onPress={logout} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 2 },
});
