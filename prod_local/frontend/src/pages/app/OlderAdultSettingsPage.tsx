import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConsentContent } from '../../components/app/ConsentContent';
import { ActivityReminderSettings } from '../../components/app/ActivityReminderSettings';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import type { ConsentState, ConsentText, OlderAdultAppProfile } from '../../types';

export function OlderAdultSettingsPage() {
  const navigate = useNavigate();
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
    if (!olderAdultAppService.hasToken()) {
      navigate('/app/vincular', { replace: true });
      return;
    }

    void load();
    // La comprobación inicial de sesión solo debe ejecutarse al montar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
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
        navigate('/app/vincular', {
          replace: true,
          state: { message: 'Tu vinculación ya no está activa. Pide un código nuevo.' },
        });
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

  function openPinModal() {
    setPin('');
    setPinError('');
    setPinOpen(true);
  }

  function closePinModal() {
    if (pinBusy) return;
    setPinOpen(false);
    setPin('');
    setPinError('');
    // HU-011: cancelar el cierre de sesión vuelve a las actividades.
    navigate('/app');
  }

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pinLocked) return;

    if (!/^\d{4}$/.test(pin)) {
      setPinError('Escribe tu PIN de 4 números.');
      return;
    }

    setPinBusy(true);
    setPinError('');

    try {
      await olderAdultAppService.logout(pin);
      olderAdultAppService.clearAll();
      navigate('/app/vincular', {
        replace: true,
        state: {
          message: 'Cerraste tu sesión. Para volver a entrar, pídele a tu familiar un código nuevo.',
        },
      });
    } catch (err) {
      if (err instanceof AppApiError && err.status === 401) {
        olderAdultAppService.clearAll();
        navigate('/app/vincular', {
          replace: true,
          state: { message: 'Tu vinculación ya no está activa. Pide un código nuevo.' },
        });
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
              consent: {
                version: consentText.version,
                acceptedAt: new Date().toISOString(),
              },
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
      <main className="senior-app">
        <div className="senior-shell">
          <p className="senior-loading">Cargando tus ajustes…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="senior-app">
      <div className="senior-shell">
        <header className="senior-header">
          <div>
            <p className="senior-eyebrow">Mis ajustes</p>
            <h1>{profile?.name ?? 'Ajustes'}</h1>
            <p>Aquí puedes leer qué información compartes y cerrar tu sesión.</p>
          </div>
          <Link className="senior-link" to="/app">
            Volver a mis actividades
          </Link>
        </header>

        {error ? (
          <div className="senior-error" role="alert">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="senior-notice" role="status">
            {notice}
          </div>
        ) : null}

        <section className="senior-card">
          <h2>Qué información compartes con tu familiar</h2>

          {consentText ? (
            <>
              <ConsentContent consent={consentText} />

              {profile?.consent?.acceptedAt ? (
                <p className="senior-consent-accepted">
                  Aceptaste este texto el{' '}
                  {new Date(profile.consent.acceptedAt).toLocaleDateString('es-CO', {
                    dateStyle: 'long',
                  })}
                  {profile.consent.version ? ` (versión ${profile.consent.version}).` : '.'}
                </p>
              ) : null}

              {needsConsent ? (
                <div className="senior-consent-reaccept">
                  <p>
                    El texto cambió. Para seguir usando la app, necesitamos que lo aceptes
                    de nuevo.
                  </p>
                  {reacceptError ? (
                    <p className="senior-inline-error" role="alert">
                      {reacceptError}
                    </p>
                  ) : null}
                  <label className="senior-checkbox-row" htmlFor="settings-reaccept">
                    <input
                      id="settings-reaccept"
                      className="senior-checkbox"
                      type="checkbox"
                      checked={reaccept}
                      onChange={(event) => setReaccept(event.target.checked)}
                      disabled={reacceptBusy}
                    />
                    <span>{consentText.acceptLabel}</span>
                  </label>
                  <button
                    className="senior-btn senior-btn-primary"
                    type="button"
                    onClick={() => void handleReaccept()}
                    disabled={reacceptBusy || !reaccept}
                  >
                    {reacceptBusy ? 'Guardando…' : 'Acepto y quiero continuar'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p>No pudimos cargar el texto del consentimiento. Revisa tu conexión.</p>
          )}
        </section>

        <ActivityReminderSettings />

        <section className="senior-card">
          <h2>Cerrar mi sesión</h2>
          <p>
            Para cerrar la sesión necesitas tu PIN de 4 números. Al cerrarla, tu familiar
            dejará de ver tus actividades y necesitarás un código nuevo para volver a entrar.
          </p>
          <button className="senior-btn senior-btn-secondary" type="button" onClick={openPinModal}>
            Cerrar sesión con mi PIN
          </button>
        </section>
      </div>

      {pinOpen ? (
        <div className="senior-modal-backdrop" role="presentation">
          <section
            className="senior-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-modal-title"
          >
            <h2 id="pin-modal-title">Escribe tu PIN</h2>
            <p>Tu PIN tiene 4 números.</p>

            <form className="senior-form" onSubmit={handleLogout} noValidate>
              <label className="senior-label" htmlFor="logout-pin">
                PIN
              </label>
              <input
                id="logout-pin"
                className="senior-input senior-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setPinError('');
                }}
                disabled={pinBusy || pinLocked}
                autoFocus
              />

              {pinError ? (
                <p className="senior-inline-error" role="alert">
                  {pinError}
                </p>
              ) : null}

              {pinLocked ? (
                <p className="senior-notice" role="status">
                  Espera {Math.ceil(remainingSeconds / 60)} minuto(s) para intentar de nuevo.
                </p>
              ) : null}

              <div className="senior-form-actions">
                <button
                  className="senior-btn senior-btn-primary"
                  type="submit"
                  disabled={pinBusy || pinLocked || pin.length !== 4}
                >
                  {pinBusy ? 'Cerrando…' : 'Cerrar sesión'}
                </button>
                <button
                  className="senior-btn senior-btn-secondary"
                  type="button"
                  onClick={closePinModal}
                  disabled={pinBusy}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
