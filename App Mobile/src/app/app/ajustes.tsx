import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConsentContent } from '../../components/app/ConsentContent';
import { ReminderSettings } from '../../components/app/ReminderSettings';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { LoadingState } from '../../components/ui/LoadingState';
import { Notification } from '../../components/ui/Notification';
import { RequireSenior } from '../../components/auth/RequireAuth';
import { Screen } from '../../components/ui/Screen';
import { cardShadow } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import type { ConsentState, ConsentText, OlderAdultAppProfile } from '../../types';

/**
 * HU-008 y HU-011 - Ajustes del adulto mayor.
 *
 * Muestra qué información se comparte, permite volver a aceptar el
 * consentimiento cuando cambia el texto y cierra la sesión con el PIN de 4
 * números. Al cerrar sesión se borran token, rutina y cola offline.
 */
export default function SeniorSettingsScreen() {
  return (
    <RequireSenior>
      <SeniorSettingsContent />
    </RequireSenior>
  );
}

function SeniorSettingsContent() {
  const theme = useTheme();

  const [profile, setProfile] = useState<OlderAdultAppProfile | null>(null);
  const [consentText, setConsentText] = useState<ConsentText | null>(null);
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const [reaccept, setReaccept] = useState(false);
  const [reacceptBusy, setReacceptBusy] = useState(false);
  const [reacceptError, setReacceptError] = useState('');

  const needsConsent = consentState?.required === true;
  const remainingSeconds = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - nowTick) / 1000))
    : 0;
  const pinLocked = remainingSeconds > 0;

  useEffect(() => {
    void load();
    // La comprobación inicial de sesión solo debe ejecutarse al montar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  useEffect(() => {
    if (lockedUntil && nowTick >= lockedUntil) {
      setLockedUntil(null);
      setPinError('');
    }
  }, [lockedUntil, nowTick]);

  async function load() {
    setLoading(true);
    setError('');

    try {
      const session = await olderAdultAppService.session();
      setProfile(session.olderAdult);
      setConsentState(session.consent);

      try {
        const response = await olderAdultAppService.getConsent();
        setConsentText(response.consent);
        olderAdultAppService.saveConsentCache(response.consent);
      } catch {
        const cached = olderAdultAppService.readConsentCache();
        if (cached) setConsentText(cached);
      }
    } catch (err) {
      if (err instanceof AppApiError && err.status === 401) {
        olderAdultAppService.clearAll();
        router.replace('/app/vincular');
        return;
      }

      if (err instanceof AppApiError && err.offline) {
        const cached = olderAdultAppService.readConsentCache();
        if (cached) setConsentText(cached);
        setError('Sin internet. No pudimos actualizar tus ajustes.');
      } else if (err instanceof AppApiError) {
        setError(err.message);
      } else {
        setError('No pudimos cargar tus ajustes. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  function closePinModal() {
    if (pinBusy) return;
    setPinOpen(false);
    setPin('');
    setPinError('');
    // HU-011: cancelar el cierre de sesión vuelve a las actividades.
    router.replace('/app');
  }

  async function handleLogout() {
    if (pinLocked || pinBusy) return;

    if (!/^\d{4}$/.test(pin)) {
      setPinError('Escribe tu PIN de 4 números.');
      return;
    }

    setPinBusy(true);
    setPinError('');

    try {
      await olderAdultAppService.logout(pin);
      olderAdultAppService.clearAll();
      router.replace('/app/vincular');
    } catch (err) {
      if (err instanceof AppApiError && err.status === 401) {
        olderAdultAppService.clearAll();
        router.replace('/app/vincular');
        return;
      }

      if (err instanceof AppApiError) {
        if (err.code === 'PIN_ATTEMPTS_LOCKED') {
          const seconds = err.retryAfterSeconds ?? 5 * 60;
          setLockedUntil(Date.now() + seconds * 1000);
          setNowTick(Date.now());
          setPinError(
            `PIN incorrecto. Espera ${Math.ceil(seconds / 60)} minuto(s) para intentar de nuevo.`
          );
        } else if (err.code === 'PIN_INVALID') {
          setPinError('PIN incorrecto.');
        } else {
          setPinError(err.message);
        }
      } else {
        setPinError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
      }
    } finally {
      setPinBusy(false);
    }
  }

  async function handleReaccept() {
    if (!consentText || !reaccept) {
      setReacceptError('Marca la casilla para aceptar el consentimiento.');
      return;
    }

    setReacceptBusy(true);
    setReacceptError('');

    try {
      await olderAdultAppService.acceptConsent(consentText.version, true);
      setConsentState({
        currentVersion: consentText.version,
        acceptedVersion: consentText.version,
        required: false,
      });
      setProfile((current) =>
        current
          ? {
              ...current,
              consent: { version: consentText.version, acceptedAt: new Date().toISOString() },
            }
          : current
      );
      setReaccept(false);
      setNotice('Consentimiento aceptado. Ya puedes seguir usando la app.');
    } catch (err) {
      if (err instanceof AppApiError) {
        setReacceptError(err.message);
      } else {
        setReacceptError('No pudimos guardar el consentimiento. Inténtalo de nuevo.');
      }
    } finally {
      setReacceptBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Cargando tus ajustes…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="eyebrow">Mis ajustes</AppText>
          <AppText variant="hero" accessibilityRole="header">
            {profile?.name ?? 'Ajustes'}
          </AppText>
          <AppText variant="muted">
            Aquí puedes leer qué información compartes y cerrar tu sesión.
          </AppText>
        </View>
        <Button
          label="Volver a mis actividades"
          variant="secondary"
          onPress={() => router.replace('/app')}
          block={false}
        />
      </View>

      {error ? <Notification type="error">{error}</Notification> : null}
      {notice ? <Notification type="success">{notice}</Notification> : null}

      <Card>
        <AppText variant="title">Qué información compartes con tu familiar</AppText>

        {consentText ? (
          <>
            <ConsentContent consent={consentText} />

            {profile?.consent?.acceptedAt ? (
              <AppText variant="muted">
                Aceptaste este texto el{' '}
                {new Date(profile.consent.acceptedAt).toLocaleDateString('es-CO')}
                {profile.consent.version ? ` (versión ${profile.consent.version}).` : '.'}
              </AppText>
            ) : null}

            {needsConsent ? (
              <View style={{ gap: 10 }}>
                <Notification type="warning">
                  El texto cambió. Para seguir usando la app, necesitamos que lo aceptes de
                  nuevo.
                </Notification>

                {reacceptError ? <Notification type="error">{reacceptError}</Notification> : null}

                <Button
                  label={reaccept ? 'Quitar aceptación' : consentText.acceptLabel}
                  variant="secondary"
                  onPress={() => setReaccept((current) => !current)}
                  disabled={reacceptBusy}
                />

                <Button
                  label={reacceptBusy ? 'Guardando…' : 'Acepto y quiero continuar'}
                  onPress={() => void handleReaccept()}
                  loading={reacceptBusy}
                  disabled={!reaccept}
                />
              </View>
            ) : null}
          </>
        ) : (
          <AppText variant="muted">
            No pudimos cargar el texto del consentimiento. Revisa tu conexión.
          </AppText>
        )}
      </Card>

      <ReminderSettings />

      <Card>
        <AppText variant="title">Cerrar mi sesión</AppText>
        <AppText variant="muted">
          Para cerrar la sesión necesitas tu PIN de 4 números. Al cerrarla, tu familiar dejará
          de ver tus actividades y necesitarás un código nuevo para volver a entrar.
        </AppText>
        <Button
          label="Cerrar sesión con mi PIN"
          variant="secondary"
          onPress={() => {
            setPin('');
            setPinError('');
            setPinOpen(true);
          }}
        />
      </Card>

      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={closePinModal}>
        <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
          <SafeAreaView
            style={[
              styles.sheet,
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
            <ScrollView contentContainerStyle={{ gap: theme.spacing.sm }}>
              <AppText variant="title">Escribe tu PIN</AppText>
              <AppText variant="muted">Tu PIN tiene 4 números.</AppText>

              <FormField
                label="PIN"
                value={pin}
                onChangeText={(value) => {
                  setPin(value.replace(/\D/g, '').slice(0, 4));
                  setPinError('');
                }}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                editable={!pinBusy && !pinLocked}
                error={pinError}
              />

              {pinLocked ? (
                <Notification type="warning">
                  Espera {Math.ceil(remainingSeconds / 60)} minuto(s) para intentar de nuevo.
                </Notification>
              ) : null}

              <Button
                label={pinBusy ? 'Cerrando…' : 'Cerrar sesión'}
                onPress={() => void handleLogout()}
                loading={pinBusy}
                disabled={pinLocked || pin.length !== 4}
              />
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={closePinModal}
                disabled={pinBusy}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '90%', alignSelf: 'center', borderWidth: 2 },
});
