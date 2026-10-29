import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConsentContent } from '../../components/app/ConsentContent';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
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

  async function handleComplete(activity: AppActivity) {
    if (offline || !activities) {
      setNotice('Necesitas conexión a internet para marcar la actividad.');
      return;
    }

    setCompletingId(activity._id);
    setError('');

    try {
      await olderAdultAppService.completeActivity(activity._id, activities.date);
      setActivities((current) => {
        if (!current) return current;

        const next: AppActivitiesResponse = {
          ...current,
          activities: current.activities.map((item) =>
            item._id === activity._id
              ? { ...item, completed: true, completedAt: new Date().toISOString() }
              : item
          ),
        };

        olderAdultAppService.saveRoutineCache(next);
        return next;
      });
      setNotice('¡Muy bien! La actividad quedó marcada como hecha.');
    } catch (err) {
      if (err instanceof AppApiError && err.offline) {
        setNotice('Necesitas conexión a internet para marcar la actividad.');
      } else if (err instanceof AppApiError && err.status === 401) {
        olderAdultAppService.clearAll();
        setUnlinked(true);
        setError(err.message);
      } else if (err instanceof AppApiError && err.code === 'CONSENT_VERSION_OUTDATED') {
        setConsentState(
          err.consent ?? {
            currentVersion: 'actual',
            acceptedVersion: null,
            required: true,
          }
        );
        await loadConsentText();
      } else if (err instanceof AppApiError) {
        setError(err.message);
      } else {
        setError('No pudimos marcar la actividad. Inténtalo de nuevo.');
      }
    } finally {
      setCompletingId(null);
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
  const visibleActivities = activities ? sortActivitiesByTime(activities.activities) : [];

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
              {visibleActivities.map((activity) => (
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
                      {activity.completed ? 'Hecha ✓' : 'Pendiente'}
                    </p>
                    {activity.completed ? null : (
                      <button
                        className="senior-btn senior-btn-primary senior-btn-small"
                        type="button"
                        onClick={() => void handleComplete(activity)}
                        disabled={completingId === activity._id || offline}
                      >
                        {completingId === activity._id ? 'Guardando…' : 'Ya la hice'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
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
