import { useCallback, useEffect, useState } from 'react';

import { listActiveAlerts, resolveAlert } from '../../infrastructure/sosHttpAdapter.js';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton.jsx';

const POLL_INTERVAL_MS = 30_000;

export function SosAlertPanel({ onActiveCountChange }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const active = await listActiveAlerts();
      setAlerts(active);
      // Avisa al lobby cuántas alertas quedan activas (badge del navbar y hero).
      onActiveCountChange?.(active.length);
      setError(null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [onActiveCountChange]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function handleResolve(alertId) {
    setResolvingId(alertId);

    try {
      await resolveAlert(alertId);
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Alertas SOS</h2>
      <p className="card__hint">Las alertas activas aparecen acá y se actualizan cada 30 segundos.</p>

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="muted">Buscando alertas…</p> : null}

      {!loading && alerts.length === 0 ? <p>No hay emergencias activas.</p> : null}

      {alerts.length > 0 ? (
        <ul className="list" aria-live="polite">
          {alerts.map((alert) => (
            <li className="list__item" key={alert.id}>
              <div>
                <span className="badge badge--alert">Emergencia</span>
                <p>
                  {new Date(alert.createdAt).toLocaleString('es-AR')}
                  {alert.message ? ` · ${alert.message}` : ''}
                </p>
                <p className="muted">
                  <a
                    href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver ubicación en el mapa
                  </a>
                </p>
              </div>
              <PrimaryButton
                variant="secondary"
                onClick={() => handleResolve(alert.id)}
                disabled={resolvingId === alert.id}
              >
                {resolvingId === alert.id ? 'Resolviendo…' : 'Marcar como atendida'}
              </PrimaryButton>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
