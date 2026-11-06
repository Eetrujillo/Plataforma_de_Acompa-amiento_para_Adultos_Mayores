import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConsentContent } from '../../components/app/ConsentContent';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { Notification } from '../../components/ui/Notification';
import { Screen } from '../../components/ui/Screen';
import { useConnectivity } from '../../hooks/useConnectivity';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import type { ConsentText } from '../../types';

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/;

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function formatCode(value: string): string {
  const normalized = normalizeCode(value);
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized;
}

/**
 * HU-006 y HU-007 - Vinculación de la app del adulto mayor.
 *
 * Flujo: código del familiar → lectura del consentimiento → canje → sesión.
 * El código se puede escribir; el escaneo del QR queda pendiente con
 * `expo-camera` (ver README) porque exige cámara real para validarse.
 */
export default function LinkScreen() {
  const online = useConnectivity();

  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await olderAdultAppService.getConsent();
        if (!active) return;
        setConsent(response.consent);
        olderAdultAppService.saveConsentCache(response.consent);
      } catch {
        if (!active) return;
        const cached = olderAdultAppService.readConsentCache();
        if (cached) setConsent(cached);
        else setError('Necesitas conexión a internet para vincular la app.');
      } finally {
        if (active) setConsentLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Si ya hay una sesión válida, no tiene sentido volver a vincular.
  useEffect(() => {
    if (!olderAdultAppService.hasToken()) return;

    olderAdultAppService
      .session()
      .then(() => router.replace('/app'))
      .catch((err) => {
        if (err instanceof AppApiError && err.status === 401) {
          olderAdultAppService.clearToken();
        }
      });
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remainingSeconds = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - nowTick) / 1000))
    : 0;
  const locked = remainingSeconds > 0;

  useEffect(() => {
    if (lockedUntil && nowTick >= lockedUntil) setLockedUntil(null);
  }, [lockedUntil, nowTick]);

  async function refreshConsent() {
    try {
      const response = await olderAdultAppService.getConsent();
      setConsent(response.consent);
      olderAdultAppService.saveConsentCache(response.consent);
    } catch {
      // Se conserva el texto que ya estaba visible.
    }
  }

  async function handleSubmit() {
    if (locked || submitting) return;

    if (!accepted) {
      setError('Debes aceptar el consentimiento para vincular la app.');
      return;
    }

    if (!consent) {
      setError('Necesitas conexión a internet para vincular la app.');
      return;
    }

    const normalized = normalizeCode(code);

    if (!CODE_REGEX.test(normalized)) {
      setError('Escribe el código completo de 8 caracteres.');
      return;
    }

    if (!online) {
      setError('Necesitas conexión a internet para vincular la app.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = await olderAdultAppService.redeem({
        code: formatCode(normalized),
        consentAccepted: true,
        consentVersion: consent.version,
      });

      // Evita mostrar la rutina guardada de un perfil anterior en este dispositivo.
      olderAdultAppService.clearRoutineCache();
      olderAdultAppService.setToken(response.sessionToken);
      router.replace('/app');
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.code === 'LINK_ATTEMPTS_LOCKED') {
          const seconds = err.retryAfterSeconds ?? 15 * 60;
          setLockedUntil(Date.now() + seconds * 1000);
          setNowTick(Date.now());
          setError(err.message);
        } else if (
          err.code === 'LINK_CODE_INVALID' ||
          err.code === 'LINK_CODE_EXPIRED' ||
          err.code === 'LINK_CODE_USED'
        ) {
          setError('Pídele a tu familiar un código nuevo.');
        } else if (err.code === 'CONSENT_VERSION_OUTDATED') {
          setAccepted(false);
          setError(err.message);
          await refreshConsent();
        } else {
          setError(err.message);
        }
      } else {
        setError('No pudimos vincular la app. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReject() {
    setAccepted(false);
    setNotice('');
    setError(consent?.rejectMessage ?? 'No se compartirá nada.');
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="eyebrow">App del adulto mayor</AppText>
          <AppText variant="hero" accessibilityRole="header">
            Vincular mi app
          </AppText>
          <AppText variant="muted">Escribe el código que te dio tu familiar.</AppText>
        </View>
        <Button
          label="Soy familiar"
          variant="secondary"
          onPress={() => router.replace('/login')}
          block={false}
        />
      </View>

      {!online ? (
        <Notification type="warning">
          Sin internet. Necesitas conexión para vincular la app.
        </Notification>
      ) : null}
      {error ? <Notification type="error">{error}</Notification> : null}
      {notice ? <Notification type="info">{notice}</Notification> : null}

      <Card>
        <AppText variant="title" style={{ fontSize: 26 }}>
          1. Escribe el código
        </AppText>
        <AppText variant="muted">
          El código tiene 8 letras y números, por ejemplo: ABCD-2345.
        </AppText>

        <FormField
          label="Código de vinculación"
          value={code}
          onChangeText={(value) => {
            setCode(formatCode(value));
            setError('');
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          placeholder="ABCD-2345"
          maxLength={9}
          editable={!locked && !submitting}
          hint="Escríbelo tal como te lo dio tu familiar."
        />

        <AppText variant="title" style={{ fontSize: 26 }}>
          2. Lee y acepta el consentimiento
        </AppText>

        {consentLoading ? (
          <AppText variant="muted">Cargando el consentimiento…</AppText>
        ) : consent ? (
          <>
            <ConsentContent consent={consent} />

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => {
                setAccepted((current) => !current);
                setError('');
              }}
              disabled={locked || submitting}
              style={styles.checkRow}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: '#5b6b7d',
                    backgroundColor: accepted ? '#0d3f7a' : '#ffffff',
                  },
                ]}
              >
                <AppText style={{ color: '#ffffff', fontWeight: '800' }}>
                  {accepted ? '✓' : ''}
                </AppText>
              </View>
              <AppText variant="label" style={{ flex: 1 }}>
                {consent.acceptLabel}
              </AppText>
            </Pressable>
          </>
        ) : (
          <AppText variant="muted">
            Necesitas conexión a internet para leer el consentimiento.
          </AppText>
        )}

        {locked ? (
          <Notification type="warning">
            No puedes intentar de nuevo por {Math.ceil(remainingSeconds / 60)} minuto(s).
          </Notification>
        ) : null}

        <Button
          label={submitting ? 'Vinculando…' : 'Acepto y quiero vincular mi app'}
          onPress={() => void handleSubmit()}
          loading={submitting}
          disabled={locked || !consent || !accepted}
        />

        <Button
          label="No acepto"
          variant="secondary"
          onPress={handleReject}
          disabled={submitting}
        />

        <Button
          label="Configurar servidor"
          variant="ghost"
          onPress={() => router.push('/conexion')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 36,
    height: 36,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
