import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Notification } from '../components/ui/Notification';
import { RequireFamily } from '../components/auth/RequireAuth';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SelectField } from '../components/ui/SelectField';
import { useTheme } from '../theme/ThemeProvider';
import { activityService } from '../services/activityService';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type {
  ActivityDayItem,
  ActivityDayResponse,
  ActivityDayStatus,
  OlderAdult,
} from '../types';
import { formatDateLabel, formatTimeFromInstant, formatTimeLabel } from '../utils/activity';
import { formatClockTime } from '../utils/time';
import { getTimeZoneLabel } from '../utils/timeZones';

/**
 * HU-020 - Estado de las actividades de hoy para el familiar.
 *
 * La lista se refresca sola cada 8 segundos (queda por debajo del criterio de
 * 10 segundos) y al volver del segundo plano. El estado lo calcula el backend;
 * aquí solo se adelanta el paso a "Vencida" comparando con `expiresAt`, sin
 * repetir el umbral de 30 minutos.
 */

const REFRESH_INTERVAL_MS = 8 * 1000;

const STATUS_LABELS: Record<ActivityDayStatus, string> = {
  pending: 'Pendiente',
  completed: 'Completada',
  expired: 'Vencida',
};

function withCurrentStatus(activity: ActivityDayItem, now: number): ActivityDayItem {
  if (activity.completed) return activity;

  const expiresAt = Date.parse(activity.expiresAt);
  if (!Number.isNaN(expiresAt) && now >= expiresAt) {
    return { ...activity, status: 'expired' };
  }

  return activity;
}

export default function TodayScreen() {
  return (
    <RequireFamily>
      <TodayContent />
    </RequireFamily>
  );
}

function TodayContent() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ olderAdultId?: string }>();

  const [adults, setAdults] = useState<OlderAdult[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [day, setDay] = useState<ActivityDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const inFlightRef = useRef(false);
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await olderAdultService.list();
        if (!active) return;

        setAdults(response.olderAdults);

        const preferred =
          response.olderAdults.find((adult) => adult._id === params.olderAdultId) ??
          response.olderAdults.find((adult) => adult.linkStatus === 'linked') ??
          response.olderAdults[0];

        if (preferred) setSelectedId(preferred._id);
        else setLoading(false);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus perfiles. Inténtalo de nuevo.'
        );
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // El perfil de la URL solo se usa en la primera carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    let active = true;

    async function fetchDay(initial: boolean) {
      // Un refresco no se pisa con el siguiente.
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (initial) setLoading(true);
      else setRefreshing(true);

      try {
        const response = await activityService.today(selectedId);
        if (!active) return;

        setDay(response);
        setError('');
        setUpdatedAt(new Date());
      } catch (err) {
        if (!active) return;

        // Si ya había datos, se conservan y solo se avisa del fallo.
        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos actualizar las actividades de hoy. Inténtalo de nuevo.'
        );
      } finally {
        inFlightRef.current = false;

        if (active) {
          // El reloj avanza aunque el refresco falle: el paso a "Vencida" es por hora.
          setNow(Date.now());
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    refreshRef.current = () => void fetchDay(false);

    void fetchDay(true);

    const timer = setInterval(() => void fetchDay(false), REFRESH_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchDay(false);
    });

    return () => {
      active = false;
      // El cambio de perfil no debe esperar al refresco anterior.
      inFlightRef.current = false;
      refreshRef.current = null;
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [selectedId]);

  function handleSelectedChange(nextId: string) {
    setDay(null);
    setUpdatedAt(null);
    setError('');
    setSelectedId(nextId);
  }

  const selectedAdult = adults.find((adult) => adult._id === selectedId) ?? null;
  const activities = (day?.activities ?? []).map((activity) => withCurrentStatus(activity, now));

  const counts = activities.reduce(
    (total, activity) => {
      total[activity.status] += 1;
      return total;
    },
    { pending: 0, completed: 0, expired: 0 } as Record<ActivityDayStatus, number>
  );

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Hoy"
        title="Actividades de hoy"
        subtitle="Revisa si tu adulto mayor está cumpliendo su rutina. La lista se actualiza sola cada pocos segundos."
        actions={
          <>
            <Button
              label="Volver al panel"
              variant="secondary"
              onPress={() => router.replace('/panel')}
              block={false}
            />
            <Button
              label="Gestionar actividades"
              variant="secondary"
              onPress={() => router.push('/actividades')}
              block={false}
            />
            <Button
              label={refreshing ? 'Actualizando…' : 'Actualizar ahora'}
              variant="secondary"
              onPress={() => refreshRef.current?.()}
              disabled={!selectedId}
              loading={refreshing}
              block={false}
            />
          </>
        }
      />

      {error ? <Notification type="error">{error}</Notification> : null}

      {loading ? (
        <Card>
          <LoadingState label="Cargando las actividades de hoy…" />
        </Card>
      ) : adults.length === 0 ? (
        <Card>
          <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
            Aún no tienes un adulto mayor registrado
          </AppText>
          <AppText variant="muted">
            Registra el perfil de tu adulto mayor para ver el estado de sus actividades.
          </AppText>
          <Button label="Registrar adulto mayor" onPress={() => router.push('/adultos-mayores')} />
        </Card>
      ) : (
        <>
          <Card>
            <SelectField
              label="Adulto mayor"
              value={selectedId}
              onChange={handleSelectedChange}
              hint={
                selectedAdult
                  ? `Zona horaria: ${getTimeZoneLabel(selectedAdult.timeZone)}`
                  : 'Selecciona a tu adulto mayor.'
              }
              options={adults.map((adult) => ({
                value: adult._id,
                label: `${adult.name}${
                  adult.linkStatus === 'linked' ? '' : ' (pendiente de vincular)'
                }`,
              }))}
            />

            {day ? (
              <View style={styles.summary}>
                <AppText variant="muted">
                  {counts.pending} {counts.pending === 1 ? 'pendiente' : 'pendientes'}
                </AppText>
                <AppText variant="muted">
                  {counts.completed} {counts.completed === 1 ? 'completada' : 'completadas'}
                </AppText>
                <AppText variant="muted">
                  {counts.expired} {counts.expired === 1 ? 'vencida' : 'vencidas'}
                </AppText>
              </View>
            ) : null}
          </Card>

          <Card>
            <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
              Hoy{day ? ` · ${formatDateLabel(day.date)}` : ''}
            </AppText>

            {!day ? (
              <AppText variant="muted">Todavía no pudimos cargar las actividades de hoy.</AppText>
            ) : activities.length === 0 ? (
              <>
                <AppText variant="muted">
                  Hoy no hay actividades programadas para {day.olderAdult.name}.
                </AppText>
                <Button
                  label="Crear una actividad"
                  onPress={() =>
                    router.push({
                      pathname: '/actividades',
                      params: { olderAdultId: day.olderAdult._id },
                    })
                  }
                />
              </>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {activities.map((activity) => {
                  const doneAt = activity.completedAt
                    ? formatTimeFromInstant(activity.completedAt, formatTimeLabel(activity.time))
                    : '';

                  const palette =
                    activity.status === 'completed'
                      ? {
                          bg: theme.colors.successBg,
                          border: theme.colors.successBorder,
                          text: theme.colors.successText,
                        }
                      : activity.status === 'expired'
                        ? {
                            bg: theme.colors.errorBg,
                            border: theme.colors.errorBorder,
                            text: theme.colors.errorText,
                          }
                        : {
                            bg: theme.colors.warningBg,
                            border: theme.colors.warningBorder,
                            text: theme.colors.warningText,
                          };

                  return (
                    <View
                      key={activity._id}
                      style={[
                        styles.card,
                        {
                          borderColor: palette.border,
                          backgroundColor: palette.bg,
                          borderRadius: theme.radius.control,
                          padding: theme.spacing.sm,
                          gap: 4,
                        },
                      ]}
                    >
                      <View style={styles.cardTop}>
                        <AppText style={{ fontSize: 30 }}>{activity.iconEmoji}</AppText>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="label">{activity.title}</AppText>
                          <AppText variant="muted">
                            {formatTimeFromInstant(
                              activity.scheduledAt,
                              formatTimeLabel(activity.time)
                            )}{' '}
                            · {activity.repeatSummary}
                          </AppText>
                        </View>
                      </View>

                      <AppText style={{ color: palette.text, fontWeight: '800' }}>
                        {STATUS_LABELS[activity.status]}
                      </AppText>

                      {activity.status === 'completed' && doneAt ? (
                        <AppText variant="muted">La marcó a las {doneAt}.</AppText>
                      ) : null}

                      {activity.status === 'expired' ? (
                        <AppText variant="muted">
                          Pasaron más de 30 minutos de su hora sin marcarla.
                        </AppText>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {updatedAt ? (
              <AppText variant="muted" style={{ fontSize: theme.font.small }}>
                Última actualización: {formatClockTime(updatedAt)}.
              </AppText>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 4 },
  card: { borderWidth: 2 },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
});
