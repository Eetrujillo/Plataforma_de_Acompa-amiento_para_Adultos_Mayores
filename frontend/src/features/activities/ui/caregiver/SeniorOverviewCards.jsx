import { useDailyRoutine } from '../../application/useDailyRoutine.js';
import { describeProgress, isCompleted, isExpired } from '../../domain/activity.js';

import { useEffect } from 'react';

function RoutineProgress({ routine, loading }) {
  if (loading) {
    return <p className="senior-card__hint">Cargando rutina…</p>;
  }

  const { total = 0, completed = 0 } = routine?.progress ?? {};
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="senior-card__bars">
      <div className="senior-card__bar-row">
        <span className="senior-card__bar-label">Hoy</span>
        <span
          className="senior-card__bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de hoy"
        >
          <i className={percent >= 100 ? 'is-ok' : percent > 0 ? undefined : 'is-miss'} style={{ width: `${percent}%` }} />
        </span>
        <span className="senior-card__bar-count">{completed}/{total}</span>
      </div>
    </div>
  );
}

function NextActivity({ activities }) {
  const pending = activities.find((activity) => !isCompleted(activity) && !isExpired(activity));
  const expired = activities.find(isExpired);

  if (!pending && !expired) {
    return <p className="senior-card__hint">Sin actividades pendientes para hoy.</p>;
  }

  const activity = pending ?? expired;

  return (
    <div className="senior-card__next">
      <span className="senior-card__next-emoji" aria-hidden="true">⏰</span>
      <div>
        <strong>{activity.title}</strong>
        <p>{pending ? 'Pendiente' : 'Expirada'} · {activity.scheduledTime}</p>
      </div>
    </div>
  );
}

function SeniorCard({ senior, onRoutineReport }) {
  const { routine, loading } = useDailyRoutine({ seniorId: senior.id });

  // Reporta la rutina cargada hacia arriba para el resumen del hero y la línea
  // del día, sin volver a pedir nada al backend.
  useEffect(() => {
    onRoutineReport?.(senior, routine);
  }, [routine, senior, onRoutineReport]);

  return (
    <section className="senior-card" aria-labelledby={`senior-card-${senior.id}`}>
      <header className="senior-card__head">
        <span className="senior-card__avatar" aria-hidden="true">🧓</span>
        <div>
          <h2 id={`senior-card-${senior.id}`}>{senior.fullName}</h2>
          <p className="senior-card__meta">{describeProgress(routine?.progress) || 'Sin datos todavía'}</p>
        </div>
      </header>

      <RoutineProgress routine={routine} loading={loading} />
      <NextActivity activities={routine?.activities ?? []} />

      <footer className="senior-card__foot">
        <a className="senior-card__link" href={`#/caregiver?senior=${encodeURIComponent(senior.id)}`}>
          Ver rutina
        </a>
      </footer>
    </section>
  );
}

export function SeniorOverviewCards({ seniors, onRoutineReport }) {
  if (!seniors.length) {
    return null;
  }

  return (
    <section className="senior-cards" aria-label="Personas a tu cargo">
      {seniors.map((senior) => (
        <SeniorCard key={senior.id} senior={senior} onRoutineReport={onRoutineReport} />
      ))}
    </section>
  );
}
