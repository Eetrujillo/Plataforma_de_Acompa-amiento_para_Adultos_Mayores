import { useEffect, useState } from 'react';
import {
  SECOND_REMINDER_DELAY_MINUTES,
  getPermission,
  isSecureContext,
  isSupported,
  playChime,
  requestPermission,
  showReminderNotification,
} from '../../services/reminderService';
import type { ReminderPermission } from '../../services/reminderService';

/**
 * HU-016 - Activacion de los avisos de actividades.
 *
 * El permiso de notificaciones no se puede pedir solo: el navegador exige un
 * clic. Por eso hay un boton explicito y, si el adulto mayor ya lo bloqueo, se
 * le explica como volver a activarlo en su telefono.
 */
export function ActivityReminderSettings() {
  const [permission, setPermission] = useState<ReminderPermission>('default');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  async function handleEnable() {
    setBusy(true);
    setNotice('');

    try {
      const result = await requestPermission();
      setPermission(result);

      if (result === 'granted') {
        setNotice('Listo. Te avisaremos a la hora de cada actividad.');
        playChime();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    playChime();
    await showReminderNotification({
      key: 'prueba',
      activityId: 'prueba',
      title: 'Así se verá tu aviso',
      iconEmoji: '🔔',
      kind: 'initial',
      fireAt: Date.now(),
      time: '',
    });
    setNotice('Enviamos un aviso de prueba.');
  }

  if (!isSupported()) {
    return (
      <section className="senior-card">
        <h2>Avisos de mis actividades</h2>
        {isSecureContext() ? (
          <p>
            Este navegador no puede mostrar avisos. Abre la app en Chrome o en Safari
            para recibirlos.
          </p>
        ) : (
          <p>
            Los avisos necesitan una conexión segura. Pídele a tu familiar que abra la
            app con la dirección que empieza por <strong>https</strong>.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="senior-card">
      <h2>Avisos de mis actividades</h2>

      <p>
        Si activas los avisos, te avisamos a la hora de cada actividad. Si a los{' '}
        {SECOND_REMINDER_DELAY_MINUTES} minutos todavía no la marcaste como hecha, te
        avisamos otra vez.
      </p>

      {notice ? (
        <div className="senior-notice" role="status">
          {notice}
        </div>
      ) : null}

      {permission === 'granted' ? (
        <>
          <p className="senior-consent-accepted">Los avisos están activados.</p>
          <button
            className="senior-btn senior-btn-secondary"
            type="button"
            onClick={() => void handleTest()}
          >
            Probar el aviso
          </button>
        </>
      ) : permission === 'denied' ? (
        <div className="senior-notice" role="alert">
          <p>
            <strong>Los avisos están bloqueados en tu celular.</strong>
          </p>
          <p>Para activarlos:</p>
          <ol>
            <li>Abre la configuración de tu celular.</li>
            <li>Busca las aplicaciones y elige tu navegador.</li>
            <li>Entra en Notificaciones y permite los avisos.</li>
            <li>Vuelve a esta pantalla y prueba otra vez.</li>
          </ol>
        </div>
      ) : (
        <button
          className="senior-btn senior-btn-primary"
          type="button"
          onClick={() => void handleEnable()}
          disabled={busy}
        >
          {busy ? 'Activando…' : 'Activar avisos'}
        </button>
      )}

      <p className="senior-footer-note">
        Los avisos suenan mientras la app está abierta. Deja la app abierta para
        escucharlos.
      </p>
    </section>
  );
}
