import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { startReminderScheduler } from '../../services/reminderService';
import type { ReminderItem } from '../../services/reminderService';

/**
 * HU-016 - Anfitrion de los avisos.
 *
 * Se monta una sola vez en `main.jsx` para que el planificador siga vivo en
 * cualquier pantalla de la app. El aviso en pantalla funciona aunque las
 * notificaciones del sistema esten bloqueadas; en ese caso es el unico canal.
 */
export function ActivityReminderHost() {
  const [reminder, setReminder] = useState<ReminderItem | null>(null);

  useEffect(() => {
    return startReminderScheduler((item) => setReminder(item));
  }, []);

  if (!reminder) return null;

  const isSecond = reminder.kind === 'second';

  return (
    <div className="senior-reminder-host" role="alert" aria-live="assertive">
      <section className="senior-reminder" aria-labelledby="senior-reminder-title">
        <span className="senior-reminder-icon" aria-hidden="true">
          {reminder.iconEmoji}
        </span>

        <div className="senior-reminder-body">
          <p className="senior-reminder-eyebrow">
            {isSecond ? 'Todavía no la has hecho' : 'Es la hora'}
          </p>
          <h2 id="senior-reminder-title">{reminder.title}</h2>
          <p>
            {isSecond
              ? 'Ya pasaron 10 minutos y sigue sin marcar. Cuando la termines, márcala como hecha.'
              : 'Cuando la termines, márcala como hecha.'}
          </p>
        </div>

        <div className="senior-reminder-actions">
          <Link
            className="senior-btn senior-btn-primary"
            to="/app"
            onClick={() => setReminder(null)}
          >
            Ver mis actividades
          </Link>
          <button
            className="senior-btn senior-btn-secondary"
            type="button"
            onClick={() => setReminder(null)}
          >
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
