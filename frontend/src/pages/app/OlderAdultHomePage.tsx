import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConsentContent } from '../../components/app/ConsentContent';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import {
  enqueueCompletion,
  findQueuedCompletion,
  readCompletionQueue,
  removeQueuedCompletion,
  subscribeToCompletionQueue,
} from '../../services/completionQueue';
import type { QueuedCompletion } from '../../services/completionQueue';
import { getPermission, isSupported } from '../../services/reminderService';
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
const UNDO_WINDOW_MS = 10000;

export function OlderAdultHomePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<OlderAdultAppProfile | null>(null);
  const [activities, setActivities] = useState<AppActivitiesResponse | null>(null);
  const [consentText, setConsentText] = useState<ConsentText | null>(null);
  const [consentState, setConsentState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [unlinked, setUnlinked] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [reminderPermission, setReminderPermission] = useState(() => getPermission());
  // HU-018: ventana de "Deshacer" por actividad (id -> instante de vencimiento).
  const [undoWindows, setUndoWindows] = useState<Record<string, number>>({});
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  // Un segundo toque mientras la primera llamada sigue en curso no cuenta.
  const inFlightRef = useRef<Set<string>>(new Set());
  // HU-019: marcas guardadas en el celular que todavía no llegaron al servidor.
  const [queuedCompletions, setQueuedCompletions] = useState<QueuedCompletion[]>(() =>
    readCompletionQueue()
  );

  const needsConsent = consentState?.required === true;

  useEffect(() => {
    if (!olderAdultAppService.hasToken()) {
      navigate('/app/vincular', { replace: true });
      return;
    }

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

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
      void refresh();
    }

    function handleOffline() {
      setOffline(true);
      const cached = olderAdultAppService.readRoutineCache();
      if (cached) {
        setActivities(cached.data);
        setProfile(cached.data.olderAdult);
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HU-016: el permiso puede cambiar fuera de la app (ajustes del telefono).
  useEffect(() => {
    function syncReminderPermission() {
      setReminderPermission(getPermission());
    }

    document.addEventListener('visibilitychange', syncReminderPermission);
    return () => document.removeEventListener('visibilitychange', syncReminderPermission);
  }, []);

  useEffect(() => {
    if (offline || needsConsent || unlinked) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, needsConsent, unlinked]);

  // HU-018: mientras haya una marca recién hecha, el reloj avanza cada segundo
  // para mostrar cuánto queda de "Deshacer" y retirar la ventana al vencer.
  useEffect(() => {
    if (Object.keys(undoWindows).length === 0) return;

    const timer = window.setInterval(() => {
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

    return () => window.clearInterval(timer);
  }, [undoWindows]);

  // HU-019: la cola de marcas sin enviar puede cambiar desde el envio automatico,
  // que vive fuera de esta pantalla.
  useEffect(() => {
    let previousCount = readCompletionQueue().length;
    setQueuedCompletions(readCompletionQueue());

    return subscribeToCompletionQueue(() => {
      const next = readCompletionQueue();
      setQueuedCompletions(next);

      // Si la cola bajó, el servidor ya tiene esas marcas: se refresca la lista.
      if (next.length < previousCount) void refresh();
      previousCount = next.length;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true);
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

      // HU-017: "hoy" se calcula con la zona horaria del celular, no con la del perfil.
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
          setOffline(true);
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
      // No se marca la app como "sin conexión" por un fallo puntual: el estado
      // global lo cambian los eventos del navegador y el refresco periódico.
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

    if (offline) {
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

    if (!queued && offline) {
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

      if (!offline) {
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
      <main className="senior-app">
        <div className="senior-shell">
          <section className="senior-card">
            <h1>Tu vinculación ya no está activa</h1>
            <p>
              Pídele a tu familiar un código nuevo. Mientras tanto, no se compartirá
              información con tu familiar.
            </p>
            {consentError ? (
              <div className="senior-notice" role="status">
                {consentError}
              </div>
            ) : null}
            {error ? (
              <div className="senior-error" role="alert">
                {error}
              </div>
            ) : null}
            <Link className="senior-btn senior-btn-primary" to="/app/vincular">
              Vincular de nuevo
            </Link>
          </section>
        </div>
      </main>
    );
  }

  if (needsConsent) {
    return (
      <main className="senior-app">
        <div className="senior-shell">
          <header className="senior-header">
            <div>
              <p className="senior-eyebrow">Antes de continuar</p>
              <h1>Vuelve a leer el consentimiento</h1>
              <p>El texto cambió. Necesitamos que lo aceptes de nuevo.</p>
            </div>
          </header>

          {consentError ? (
            <div className="senior-error" role="alert">
              {consentError}
            </div>
          ) : null}

          <section className="senior-card">
            {consentText ? (
              <>
                <ConsentContent consent={consentText} />
                <label className="senior-checkbox-row" htmlFor="reaccept-consent">
                  <input
                    id="reaccept-consent"
                    className="senior-checkbox"
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => setConsentAccepted(event.target.checked)}
                    disabled={consentSubmitting}
                  />
                  <span>{consentText.acceptLabel}</span>
                </label>
                <div className="senior-form-actions">
                  <button
                    className="senior-btn senior-btn-primary"
                    type="button"
                    onClick={() => void handleAcceptConsent()}
                    disabled={consentSubmitting || !consentAccepted}
                  >
                    {consentSubmitting ? 'Guardando…' : 'Acepto y quiero continuar'}
                  </button>
                  <button
                    className="senior-btn senior-btn-secondary"
                    type="button"
                    onClick={handleRejectConsent}
                    disabled={consentSubmitting}
                  >
                    No acepto
                  </button>
                </div>
              </>
            ) : (
              <p>Cargando el consentimiento…</p>
            )}
          </section>
        </div>
      </main>
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
    <main className="senior-app">
      <div className="senior-shell">
        <header className="senior-header">
          <div>
            <p className="senior-eyebrow">Mis actividades</p>
            <h1>Hola, {profile?.name ?? 'bienvenido'}</h1>
            <p>{formatDateLabel(dateKey)}</p>
          </div>
          <Link className="senior-link" to="/app/ajustes">
            Ajustes
          </Link>
        </header>

        {offline ? (
          <p className="senior-offline" role="status">
            {activities
              ? 'Sin conexión: esta es tu última lista guardada.'
              : 'Sin conexión: todavía no hay una lista guardada.'}
          </p>
        ) : null}

        {queuedCompletions.length > 0 ? (
          <p className="senior-offline" role="status">
            {queuedCompletions.length === 1
              ? '1 actividad guardada en tu celular. Se enviará sola.'
              : `${queuedCompletions.length} actividades guardadas en tu celular. Se enviarán solas.`}
          </p>
        ) : null}

        {isSupported() && reminderPermission !== 'granted' ? (
          <div className="senior-notice" role="status">
            <p>
              {reminderPermission === 'denied'
                ? 'Los avisos están bloqueados en tu celular, así que no sonarán.'
                : 'Activa los avisos para no olvidar tus actividades.'}
            </p>
            <Link className="senior-link" to="/app/ajustes">
              Cómo activar los avisos
            </Link>
          </div>
        ) : null}

        {notice ? (
          <div className="senior-notice" role="status">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="senior-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="senior-card">
          <h2>{isToday ? 'Lo que tienes para hoy' : 'Tu última lista guardada'}</h2>

          {loading && !activities ? (
            <p>Cargando tus actividades…</p>
          ) : !activities ? (
            <p>No pudimos cargar tus actividades. Revisa tu conexión.</p>
          ) : visibleActivities.length === 0 ? (
            <p>
              {isToday
                ? 'Hoy no tienes actividades'
                : 'No hay actividades guardadas para ese día.'}
            </p>
          ) : (
            <div className="senior-activity-list">
              {visibleActivities.map((activity) => {
                const remaining = secondsLeft(activity._id);
                const doneAt = activity.completedAt
                  ? formatTimeFromInstant(activity.completedAt, '')
                  : '';

                return (
                  <article
                    className={`senior-activity${activity.completed ? ' senior-activity-done' : ''}`}
                    key={activity._id}
                  >
                    <span className="senior-activity-icon" aria-hidden="true">
                      {activity.iconEmoji}
                    </span>
                    <div className="senior-activity-body">
                      <h3>{activity.title}</h3>
                      <p className="senior-activity-time">
                        {formatTimeFromInstant(activity.scheduledAt, formatTimeLabel(activity.time))}
                        {' · '}
                        {activity.repeatSummary}
                      </p>
                      <p
                        className={`senior-status ${
                          activity.completed ? 'senior-status-done' : 'senior-status-pending'
                        }`}
                      >
                        {activity.completed ? 'Completada ✓' : 'Pendiente'}
                      </p>
                      {activity.completed && doneAt ? (
                        <p className="senior-activity-time">La marcaste a las {doneAt}</p>
                      ) : null}
                      {activity.completed ? (
                        remaining > 0 ? (
                          <button
                            className="senior-btn senior-btn-secondary senior-activity-action"
                            type="button"
                            onClick={() => void handleUndo(activity)}
                            disabled={undoingId === activity._id || completingId === activity._id}
                          >
                            {undoingId === activity._id
                              ? 'Deshaciendo…'
                              : `Deshacer (${remaining} s)`}
                          </button>
                        ) : null
                      ) : (
                        <button
                          className="senior-btn senior-btn-primary senior-activity-action"
                          type="button"
                          onClick={() => void handleComplete(activity)}
                          disabled={completingId === activity._id}
                        >
                          Ya la hice
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="senior-footer-note">
          Si necesitas ayuda, pídele a tu familiar que revise la app.
        </p>
      </div>
    </main>
  );
}
