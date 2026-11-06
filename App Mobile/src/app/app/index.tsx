import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ConsentContent } from '../../components/app/ConsentContent';
import { ReminderSettings } from '../../components/app/ReminderSettings';
import { AppText } from '../../components/ui/AppText';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { Notification } from '../../components/ui/Notification';
import { RequireSenior } from '../../components/auth/RequireAuth';
import { Screen } from '../../components/ui/Screen';
import { useCompletionQueue } from '../../hooks/useCompletionQueue';
import { useConnectivity } from '../../hooks/useConnectivity';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import {
  enqueueCompletion,
  findQueuedCompletion,
  removeQueuedCompletion,
} from '../../services/completionQueue';
import { getPermission } from '../../services/reminderService';
import type { ReminderPermission } from '../../services/reminderService';
import type {
  AppActivitiesResponse,
  AppActivity,
  ConsentState,
  ConsentText,
  OlderAdultAppProfile,
} from '../../types';
import {
  formatDateLabel,
  formatTimeFromInstant,
  formatTimeLabel,
  getDeviceDateKey,
  sortActivitiesByTime,
} from '../../utils/activity';

/** HU-018: ventana para deshacer una marca recién hecha. */
const UNDO_WINDOW_MS = 10_000;

/** Refresco periódico mientras la app está abierta. */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * HU-017 a HU-019 - Pantalla principal del adulto mayor.
 *
 * Muestra la rutina del día con botones grandes para marcar actividades.
 * Cambios respecto de la web:
 * - `navigator.onLine` → `useConnectivity` (NetInfo).
 * - `visibilitychange` → `AppState`.
 * - `localStorage` → cola en memoria + `AsyncStorage`.
 *
 * La marca se guarda antes de enviarse (HU-019), así que un corte de red no
 * pierde el toque ni la hora real.
 */
export default function SeniorHomeScreen() {
  return (
    <RequireSenior>
      <SeniorHomeContent />
    </RequireSenior>
  );
}

function SeniorHomeContent() {
  const online = useConnectivity();
  const queuedCompletions = useCompletionQueue();

  const [profile, setProfile] = useState<OlderAdultAppProfile | null>(null);
  const [activities, setActivities] = useState<AppActivitiesResponse | null>(null);
  const [consentText, setConsentText] = useState<ConsentText | null>(null);
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [unlinked, setUnlinked] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState('');

  const [reminderPermission, setReminderPermission] = useState<ReminderPermission>(() =>
    getPermission()
  );

  // HU-018: ventana de "Deshacer" por actividad (id -> instante de vencimiento).
  const [undoWindows, setUndoWindows] = useState<Record<string, number>>({});
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  // Un segundo toque mientras la primera llamada sigue en curso no cuenta.
  const inFlightRef = useRef<Set<string>>(new Set());
  const refreshRef = useRef<(() => void) | null>(null);

  const needsConsent = consentState?.required === true;

  useEffect(() => {
    // La caché pinta algo de inmediato; el servidor corrige después.
    const cached = olderAdultAppService.readRoutineCache();
    if (cached) {
      setActivities(cached.data);
      setProfile(cached.data.olderAdult);
      setLoading(false);
    }

    void refresh();
    // La comprobación inicial de sesión solo debe ejecutarse al montar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al recuperar la conexión se intenta refrescar; al perderla se muestra la caché.
  useEffect(() => {
    if (online) {
      void refresh();
    } else {
      const cached = olderAdultAppService.readRoutineCache();
      if (cached) {
        setActivities(cached.data);
        setProfile(cached.data.olderAdult);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // HU-016: el permiso puede cambiar fuera de la app (ajustes del teléfono).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReminderPermission(getPermission());
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!online || needsConsent || unlinked) return;

    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, needsConsent, unlinked]);

  // HU-018: mientras haya una marca recién hecha, el reloj avanza cada segundo
  // para mostrar cuánto queda de "Deshacer" y retirar la ventana al vencer.
  useEffect(() => {
    if (Object.keys(undoWindows).length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      setUndoWindows((current) => {
        const next: Record<string, number> = {};
        let expired = false;

        for (const [activityId, expiresAt] of Object.entries(current)) {
          if (expiresAt > now) next[activityId] = expiresAt;
          else expired = true;
        }

        return expired ? next : current;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [undoWindows]);

  // HU-019: si la cola baja, el servidor ya tiene esas marcas: se refresca.
  const previousQueueLength = useRef(queuedCompletions.length);
  useEffect(() => {
    if (queuedCompletions.length < previousQueueLength.current) void refresh();
    previousQueueLength.current = queuedCompletions.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedCompletions.length]);

  async function loadConsentText() {
    try {
      const response = await olderAdultAppService.getConsent();
      setConsentText(response.consent);
      olderAdultAppService.saveConsentCache(response.consent);
    } catch {
      const cached = olderAdultAppService.readConsentCache();
      if (cached) setConsentText(cached);
    }
  }

  async function refresh() {
    if (!online) {
      const cached = olderAdultAppService.readRoutineCache();
      if (cached) {
        setActivities(cached.data);
        setProfile(cached.data.olderAdult);
      } else {
        setError('Necesitas conexión a internet para ver tus actividades.');
      }
      setLoading(false);
      return;
    }

    try {
      const session = await olderAdultAppService.session();
      setProfile(session.olderAdult);
      setConsentState(session.consent);
      setUnlinked(false);

      if (session.consent.required) {
        await loadConsentText();
        setLoading(false);
        return;
      }

      // HU-017: "hoy" se calcula con la zona horaria del celular.
      const response = await olderAdultAppService.activities(getDeviceDateKey());
      setActivities(response);
      setProfile(response.olderAdult);
      olderAdultAppService.saveRoutineCache(response);
      setError('');
      setNotice('');
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.status === 401) {
          olderAdultAppService.clearAll();
          setUnlinked(true);
          setError(err.message);
        } else if (err.code === 'CONSENT_VERSION_OUTDATED') {
          setConsentState(
            err.consent ?? {
              currentVersion: 'actual',
              acceptedVersion: null,
              required: true,
            }
          );
          await loadConsentText();
        } else if (err.offline) {
          const cached = olderAdultAppService.readRoutineCache();
          if (cached) {
            setActivities(cached.data);
            setProfile(cached.data.olderAdult);
          } else {
            setError('Necesitas conexión a internet para ver tus actividades.');
          }
        } else {
          setError(err.message);
        }
      } else {
        setError('No pudimos cargar tus actividades. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  // El callback de refresco se guarda para el botón "Actualizar".
  refreshRef.current = () => void refresh();

  function patchActivity(activityId: string, patch: Partial<AppActivity>) {
    setActivities((current) => {
      if (!current) return current;

      const next: AppActivitiesResponse = {
        ...current,
        activities: current.activities.map((item) =>
          item._id === activityId ? { ...item, ...patch } : item
        ),
      };

      olderAdultAppService.saveRoutineCache(next);
      return next;
    });
  }

  function openUndoWindow(activityId: string) {
    const now = Date.now();
    setClock(now);
    setUndoWindows((current) => ({ ...current, [activityId]: now + UNDO_WINDOW_MS }));
  }

  function closeUndoWindow(activityId: string) {
    setUndoWindows((current) => {
      if (!(activityId in current)) return current;

      const next = { ...current };
      delete next[activityId];
      return next;
    });
  }

  function secondsLeft(activityId: string): number {
    const expiresAt = undoWindows[activityId];
    if (!expiresAt) return 0;

    return Math.max(0, Math.ceil((expiresAt - clock) / 1000));
  }

  async function handleAppError(
    err: unknown,
    messages: { fallback: string; offline: string }
  ) {
    if (!(err instanceof AppApiError)) {
      setError(messages.fallback);
      return;
    }

    if (err.offline) {
      setNotice(messages.offline);
    } else if (err.status === 401) {
      olderAdultAppService.clearAll();
      setUnlinked(true);
      setError(err.message);
    } else if (err.code === 'CONSENT_VERSION_OUTDATED') {
      setConsentState(
        err.consent ?? {
          currentVersion: 'actual',
          acceptedVersion: null,
          required: true,
        }
      );
      await loadConsentText();
    } else {
      setError(err.message);
    }
  }

  async function handleComplete(activity: AppActivity) {
    if (!activities) return;

    // HU-018: dos toques seguidos cuentan como una sola confirmación.
    if (inFlightRef.current.has(activity._id)) return;

    inFlightRef.current.add(activity._id);
    setCompletingId(activity._id);
    setError('');
    setNotice('');

    // HU-019: la marca se guarda en el celular antes de intentar el envío.
    const completedAt = new Date().toISOString();
    enqueueCompletion({ activityId: activity._id, date: activities.date, completedAt });
    patchActivity(activity._id, { completed: true, completedAt });
    openUndoWindow(activity._id);

    if (!online) {
      setNotice('Quedó guardada en tu celular. Se enviará sola cuando vuelva la conexión.');
      inFlightRef.current.delete(activity._id);
      setCompletingId(null);
      return;
    }

    try {
      const response = await olderAdultAppService.completeActivity(
        activity._id,
        activities.date,
        completedAt
      );

      removeQueuedCompletion(activity._id, activities.date);
      // Se muestra la hora que guardó el servidor, no la del reloj del celular.
      patchActivity(activity._id, {
        completed: true,
        completedAt: response.completion?.completedAt ?? completedAt,
      });
    } catch (err) {
      if (err instanceof AppApiError && (err.status === 404 || err.status === 400)) {
        // La actividad ya no aplica: no tiene sentido reintentar.
        removeQueuedCompletion(activity._id, activities.date);
        patchActivity(activity._id, { completed: false, completedAt: null });
        closeUndoWindow(activity._id);
        setError(err.message);
      } else if (
        err instanceof AppApiError &&
        (err.status === 401 || err.code === 'CONSENT_VERSION_OUTDATED')
      ) {
        await handleAppError(err, {
          fallback: 'No pudimos marcar la actividad. Inténtalo de nuevo.',
          offline: 'Necesitas conexión a internet para marcar la actividad.',
        });
      } else {
        // Sin conexión o fallo pasajero: queda en cola y se reintenta sola.
        setNotice('Quedó guardada en tu celular. Se enviará sola cuando haya conexión.');
      }
    } finally {
      inFlightRef.current.delete(activity._id);
      setCompletingId(null);
    }
  }

  async function handleUndo(activity: AppActivity) {
    if (!activities || undoingId) return;

    // HU-019: si la marca nunca salió del celular, deshacer no necesita internet.
    const queued = findQueuedCompletion(activity._id, activities.date);

    if (!queued && !online) {
      setNotice('Necesitas conexión a internet para deshacer la marca.');
      return;
    }

    const previousCompletedAt = activity.completedAt;
    const previousWindow = undoWindows[activity._id];

    setUndoingId(activity._id);
    setError('');
    setNotice('');

    if (queued) {
      removeQueuedCompletion(activity._id, activities.date);
      closeUndoWindow(activity._id);
      patchActivity(activity._id, { completed: false, completedAt: null });

      if (online) {
        // Por si el envío llegó al servidor y se perdió la respuesta.
        try {
          await olderAdultAppService.undoCompleteActivity(activity._id, activities.date);
        } catch {
          // El siguiente refresco reconcilia el estado con el servidor.
        }
      }

      setUndoingId(null);
      return;
    }

    closeUndoWindow(activity._id);
    patchActivity(activity._id, { completed: false, completedAt: null });

    try {
      await olderAdultAppService.undoCompleteActivity(activity._id, activities.date);
      patchActivity(activity._id, { completed: false, completedAt: null });
    } catch (err) {
      patchActivity(activity._id, { completed: true, completedAt: previousCompletedAt });

      if (previousWindow) {
        setUndoWindows((current) => ({ ...current, [activity._id]: previousWindow }));
      }

      await handleAppError(err, {
        fallback: 'No pudimos deshacer la marca. Inténtalo de nuevo.',
        offline: 'Necesitas conexión a internet para deshacer la marca.',
      });
    } finally {
      setUndoingId(null);
    }
  }

  async function handleAcceptConsent() {
    if (!consentText) return;

    if (!consentAccepted) {
      setConsentError('Marca la casilla para aceptar el consentimiento.');
      return;
    }

    setConsentSubmitting(true);
    setConsentError('');

    try {
      await olderAdultAppService.acceptConsent(consentText.version, true);
      setConsentState({
        currentVersion: consentText.version,
        acceptedVersion: consentText.version,
        required: false,
      });
      setConsentAccepted(false);
      await refresh();
    } catch (err) {
      if (err instanceof AppApiError) {
        setConsentError(err.message);

        if (err.code === 'CONSENT_VERSION_OUTDATED') {
          setConsentAccepted(false);
          await loadConsentText();
        }
      } else {
        setConsentError('No pudimos guardar el consentimiento. Inténtalo de nuevo.');
      }
    } finally {
      setConsentSubmitting(false);
    }
  }

  function handleRejectConsent() {
    setConsentAccepted(false);
    setConsentError(
      consentText?.rejectMessage ??
        'No se compartirá nada. Puedes aceptar el consentimiento cuando quieras.'
    );
  }

  if (unlinked) {
    return (
      <Screen>
        <Card>
          <AppText variant="hero" accessibilityRole="header">
            Tu vinculación ya no está activa
          </AppText>
          <AppText variant="muted">
            Pídele a tu familiar un código nuevo. Mientras tanto, no se compartirá información
            con tu familiar.
          </AppText>
          {consentError ? <Notification type="info">{consentError}</Notification> : null}
          {error ? <Notification type="error">{error}</Notification> : null}
          <Button label="Vincular de nuevo" onPress={() => router.replace('/app/vincular')} />
        </Card>
      </Screen>
    );
  }

  if (needsConsent) {
    return (
      <Screen>
        <AppText variant="eyebrow">Antes de continuar</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Vuelve a leer el consentimiento
        </AppText>
        <AppText variant="muted">
          El texto cambió. Necesitamos que lo aceptes de nuevo.
        </AppText>

        {consentError ? <Notification type="error">{consentError}</Notification> : null}

        <Card>
          {consentText ? (
            <>
              <ConsentContent consent={consentText} />

              <Button
                label={consentAccepted ? 'Quitar aceptación' : consentText.acceptLabel}
                variant="secondary"
                onPress={() => setConsentAccepted((current) => !current)}
                disabled={consentSubmitting}
              />

              <Button
                label={consentSubmitting ? 'Guardando…' : 'Acepto y quiero continuar'}
                onPress={() => void handleAcceptConsent()}
                loading={consentSubmitting}
                disabled={!consentAccepted}
              />
              <Button
                label="No acepto"
                variant="ghost"
                onPress={handleRejectConsent}
                disabled={consentSubmitting}
              />
            </>
          ) : (
            <AppText variant="muted">Cargando el consentimiento…</AppText>
          )}
        </Card>
      </Screen>
    );
  }

  const todayKey = getDeviceDateKey();
  const dateKey = activities?.date ?? todayKey;
  const isToday = dateKey === todayKey;

  // HU-019: lo que sigue en la cola se muestra como completado aunque un
  // refresco haya traído la lista del servidor todavía sin la marca.
  const queuedByActivity = new Map(queuedCompletions.map((item) => [item.activityId, item]));
  const visibleActivities = activities
    ? sortActivitiesByTime(
        activities.activities.map((activity) => {
          const queued = queuedByActivity.get(activity._id);
          if (!queued || queued.date !== activities.date || activity.completed) return activity;

          return { ...activity, completed: true, completedAt: queued.completedAt };
        })
      )
    : [];

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="eyebrow">Mis actividades</AppText>
          <AppText variant="hero" accessibilityRole="header">
            Hola, {profile?.name ?? 'bienvenido'}
          </AppText>
          <AppText variant="muted">{formatDateLabel(dateKey)}</AppText>
        </View>
        <Button
          label="Ajustes"
          variant="secondary"
          onPress={() => router.push('/app/ajustes')}
          block={false}
        />
      </View>

      {!online ? (
        <Notification type="warning">
          {activities
            ? 'Sin conexión: esta es tu última lista guardada.'
            : 'Sin conexión: todavía no hay una lista guardada.'}
        </Notification>
      ) : null}

      {queuedCompletions.length > 0 ? (
        <Notification type="info">
          {queuedCompletions.length === 1
            ? '1 actividad guardada en tu celular. Se enviará sola.'
            : `${queuedCompletions.length} actividades guardadas en tu celular. Se enviarán solas.`}
        </Notification>
      ) : null}

      {reminderPermission !== 'granted' ? (
        <Notification type="info">
          {reminderPermission === 'denied'
            ? 'Los avisos están bloqueados, así que no sonarán. Puedes activarlos en Ajustes.'
            : 'Activa los avisos para no olvidar tus actividades.'}
        </Notification>
      ) : null}

      {notice ? <Notification type="info">{notice}</Notification> : null}
      {error ? <Notification type="error">{error}</Notification> : null}

      <Card>
        <AppText variant="title">
          {isToday ? 'Lo que tienes para hoy' : 'Tu última lista guardada'}
        </AppText>

        {loading && !activities ? (
          <LoadingState label="Cargando tus actividades…" />
        ) : !activities ? (
          <AppText variant="muted">
            No pudimos cargar tus actividades. Revisa tu conexión.
          </AppText>
        ) : visibleActivities.length === 0 ? (
          <AppText variant="muted">
            {isToday
              ? 'Hoy no tienes actividades'
              : 'No hay actividades guardadas para ese día.'}
          </AppText>
        ) : (
          <View style={{ gap: 14 }}>
            {visibleActivities.map((activity) => {
              const remaining = secondsLeft(activity._id);
              const doneAt = activity.completedAt
                ? formatTimeFromInstant(activity.completedAt, '')
                : '';

              return (
                <View
                  key={activity._id}
                  style={[
                    styles.activity,
                    {
                      borderColor: activity.completed ? '#1c6b38' : '#5b6b7d',
                      backgroundColor: activity.completed ? '#e3f6e9' : '#ffffff',
                      borderRadius: 16,
                      padding: 16,
                      gap: 10,
                    },
                  ]}
                >
                  <View style={styles.activityTop}>
                    <AppText style={{ fontSize: 34 }}>{activity.iconEmoji}</AppText>
                    <View style={{ flex: 1, gap: 4 }}>
                      <AppText variant="title" style={{ fontSize: 23 }}>
                        {activity.title}
                      </AppText>
                      <AppText variant="muted">
                        {formatTimeFromInstant(
                          activity.scheduledAt,
                          formatTimeLabel(activity.time)
                        )}
                        {' · '}
                        {activity.repeatSummary}
                      </AppText>
                    </View>
                  </View>

                  <AppText
                    style={{
                      fontWeight: '800',
                      color: activity.completed ? '#135c2c' : '#4a3600',
                    }}
                  >
                    {activity.completed ? 'Completada ✓' : 'Pendiente'}
                  </AppText>

                  {activity.completed && doneAt ? (
                    <AppText variant="muted">La marcaste a las {doneAt}</AppText>
                  ) : null}

                  {activity.completed ? (
                    remaining > 0 ? (
                      <Button
                        label={
                          undoingId === activity._id
                            ? 'Deshaciendo…'
                            : `Deshacer (${remaining} s)`
                        }
                        variant="secondary"
                        onPress={() => void handleUndo(activity)}
                        disabled={undoingId === activity._id || completingId === activity._id}
                      />
                    ) : null
                  ) : (
                    <Button
                      label="Ya la hice"
                      onPress={() => void handleComplete(activity)}
                      loading={completingId === activity._id}
                      disabled={completingId === activity._id}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Button
        label={loading ? 'Actualizando…' : 'Actualizar mis actividades'}
        variant="secondary"
        onPress={() => refreshRef.current?.()}
        disabled={loading}
      />

      <ReminderSettings />

      <AppText variant="muted" style={{ textAlign: 'center' }}>
        Si necesitas ayuda, pídele a tu familiar que revise la app.
      </AppText>
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
  activity: { borderWidth: 2 },
  activityTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
