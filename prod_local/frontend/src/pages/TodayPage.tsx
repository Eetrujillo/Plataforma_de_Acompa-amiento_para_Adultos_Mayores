import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Notification } from '../components/ui/Notification';
import { SelectField } from '../components/ui/SelectField';
import { activityService } from '../services/activityService';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type {
  ActivityDayItem,
  ActivityDayResponse,
  ActivityDayStatus,
  OlderAdult,
} from '../types';
import {
  formatDateLabel,
  formatTimeFromInstant,
  formatTimeLabel,
} from '../utils/activity';
import { getTimeZoneLabel } from '../utils/timeZones';

/**
 * HU-020 - Estado de las actividades de hoy para el familiar.
 *
 * La lista se refresca sola cada pocos segundos para que una marca del adulto
 * mayor se vea en menos de 10 segundos sin recargar la pagina. El estado lo
 * calcula el backend; aqui solo se adelanta el paso a "Vencida" comparando con
 * `expiresAt`, sin repetir el umbral de 30 minutos.
 */

/** Refresco automatico: 8 s deja margen bajo el criterio de 10 s. */
const REFRESH_INTERVAL_MS = 8 * 1000;

const STATUS_LABELS: Record<ActivityDayStatus, string> = {
  pending: 'Pendiente',
  completed: 'Completada',
  expired: 'Vencida',
};

function statusClass(status: ActivityDayStatus) {
  return `today-status today-status-${status}`;
}

function withCurrentStatus(activity: ActivityDayItem, now: number): ActivityDayItem {
  if (activity.completed) return activity;

  const expiresAt = Date.parse(activity.expiresAt);
  if (!Number.isNaN(expiresAt) && now >= expiresAt) {
    return { ...activity, status: 'expired' };
  }

  return activity;
}

export function TodayPage() {
  const [searchParams] = useSearchParams();
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

    async function loadAdults() {
      setLoading(true);
      setError('');

      try {
        const response = await olderAdultService.list();
        if (!active) return;

        setAdults(response.olderAdults);

        const fromQuery = searchParams.get('olderAdultId');
        const preferred =
          response.olderAdults.find((adult) => adult._id === fromQuery) ??
          response.olderAdults.find((adult) => adult.linkStatus === 'linked') ??
          response.olderAdults[0];

        if (preferred) {
          setSelectedId(preferred._id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus perfiles. Inténtalo de nuevo.'
        );
        setLoading(false);
      }
    }

    void loadAdults();

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

        // Si ya habia datos, se conservan y solo se avisa del fallo.
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

    const timer = window.setInterval(() => void fetchDay(false), REFRESH_INTERVAL_MS);

    function handleVisible() {
      if (document.visibilityState === 'visible') void fetchDay(false);
    }

    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      active = false;
      // El cambio de perfil no debe esperar al refresco anterior.
      inFlightRef.current = false;
      refreshRef.current = null;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [selectedId]);

  function handleSelectedChange(event: ChangeEvent<HTMLSelectElement>) {
    setDay(null);
    setUpdatedAt(null);
    setError('');
    setSelectedId(event.target.value);
  }

  const selectedAdult = adults.find((adult) => adult._id === selectedId) ?? null;
  const activities = (day?.activities ?? []).map((activity) =>
    withCurrentStatus(activity, now)
  );

  const counts = activities.reduce(
    (total, activity) => {
      total[activity.status] += 1;
      return total;
    },
    { pending: 0, completed: 0, expired: 0 } as Record<ActivityDayStatus, number>
  );

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Hoy</p>
          <h1>Actividades de hoy</h1>
          <p className="muted">
            Revisa si tu adulto mayor está cumpliendo su rutina. La lista se actualiza sola
            cada pocos segundos, sin recargar la página.
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn-secondary" to="/">
            Volver al panel
          </Link>
          <Link className="btn-secondary" to="/actividades">
            Gestionar actividades
          </Link>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => refreshRef.current?.()}
            disabled={!selectedId || refreshing}
          >
            {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        </div>
      </header>

      {error ? <Notification type="error">{error}</Notification> : null}

      {loading ? (
        <section className="card">
          <p className="muted adult-list-message">Cargando las actividades de hoy…</p>
        </section>
      ) : adults.length === 0 ? (
        <section className="card">
          <h2>Aún no tienes un adulto mayor registrado</h2>
          <p className="muted">
            Registra el perfil de tu adulto mayor para ver el estado de sus actividades.
          </p>
          <p className="dashboard-section-action">
            <Link className="btn-primary" to="/adultos-mayores">
              Registrar adulto mayor
            </Link>
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="activity-toolbar">
              <SelectField
                label="Adulto mayor"
                name="olderAdult"
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
            </div>

            {day ? (
              <ul className="today-summary" aria-label="Resumen del día">
                <li>
                  {counts.pending} {counts.pending === 1 ? 'pendiente' : 'pendientes'}
                </li>
                <li>
                  {counts.completed} {counts.completed === 1 ? 'completada' : 'completadas'}
                </li>
                <li>
                  {counts.expired} {counts.expired === 1 ? 'vencida' : 'vencidas'}
                </li>
              </ul>
            ) : null}
          </section>

          <section className="card">
            <h2>Hoy{day ? ` · ${formatDateLabel(day.date)}` : ''}</h2>

            {!day ? (
              <p className="muted adult-list-message">
                Todavía no pudimos cargar las actividades de hoy.
              </p>
            ) : activities.length === 0 ? (
              <>
                <p className="muted adult-list-message">
                  Hoy no hay actividades programadas para {day.olderAdult.name}.
                </p>
                <p className="dashboard-section-action">
                  <Link
                    className="btn-primary"
                    to={`/actividades?olderAdultId=${encodeURIComponent(day.olderAdult._id)}`}
                  >
                    Crear una actividad
                  </Link>
                </p>
              </>
            ) : (
              <div className="activity-list">
                {activities.map((activity) => {
                  const doneAt = activity.completedAt
                    ? formatTimeFromInstant(
                        activity.completedAt,
                        formatTimeLabel(activity.time)
                      )
                    : '';

                  return (
                    <article className="activity-card today-card" key={activity._id}>
                      <span className="activity-icon" aria-hidden="true">
                        {activity.iconEmoji}
                      </span>
                      <div className="activity-body">
                        <h3>{activity.title}</h3>
                        <p className="muted">
                          {formatTimeFromInstant(
                            activity.scheduledAt,
                            formatTimeLabel(activity.time)
                          )}{' '}
                          · {activity.repeatSummary}
                        </p>
                        <p className={statusClass(activity.status)}>
                          {STATUS_LABELS[activity.status]}
                        </p>
                        {activity.status === 'completed' && doneAt ? (
                          <p className="muted">La marcó a las {doneAt}.</p>
                        ) : null}
                        {activity.status === 'expired' ? (
                          <p className="muted">
                            Pasaron más de 30 minutos de su hora sin marcarla.
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {updatedAt ? (
              <p className="muted today-updated">
                Última actualización: {updatedAt.toLocaleTimeString('es-CO')}.
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
