import { useSosAlert } from '../../application/useSosAlert.js';

const STATUS_TEXT = {
  idle: 'Presioná el botón solo si necesitás ayuda ahora.',
  locating: 'Buscando tu ubicación…',
  sending: 'Enviando la alerta…',
  sent: 'Avisamos a tu familiar. Mantené el teléfono cerca.',
  error: 'No pudimos enviar la alerta.'
};

export function SosButton() {
  const { status, error, trigger } = useSosAlert();
  const busy = status === 'locating' || status === 'sending';

  return (
    <div>
      <button
        type="button"
        className="sos-button"
        onClick={() => trigger()}
        disabled={busy}
        aria-describedby="sos-hint"
      >
        SOS
        <span className="sos-button__hint">Emergencia</span>
      </button>

      <p className="muted" id="sos-hint" role="status" aria-live="polite">
        {STATUS_TEXT[status]}
      </p>

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
