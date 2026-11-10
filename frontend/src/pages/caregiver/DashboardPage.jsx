import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../features/auth/application/AuthContext.jsx';
import { listLinkedSeniors } from '../../features/pairing/application/pairingApi.js';
import { PairingQrPanel } from '../../features/pairing/ui/PairingQrPanel.jsx';
import { SeniorProfilePanel } from '../../features/seniors/ui/caregiver/SeniorProfilePanel.jsx';
import { ActivityComposer } from '../../features/activities/ui/caregiver/ActivityComposer.jsx';
import { SeniorOverviewCards } from '../../features/activities/ui/caregiver/SeniorOverviewCards.jsx';
import { DailyTimeline } from '../../features/activities/ui/caregiver/DailyTimeline.jsx';
import { SosAlertPanel } from '../../features/sos_emergency/ui/caregiver/SosAlertPanel.jsx';
import { PageShell } from '../../shared/components/PageShell.jsx';
import { AppTopbar } from '../../shared/components/AppTopbar.jsx';
import { PrimaryButton } from '../../shared/components/PrimaryButton.jsx';
import { LobbyHero } from './LobbyHero.jsx';

const NAV_LINKS = [
  { href: '#inicio', label: 'Inicio', icon: '🏠' },
  { href: '#rutina', label: 'Rutina diaria', icon: '🗓️' },
  { href: '#personas', label: 'Personas a cargo', icon: '🧓' },
  { href: '#sos', label: 'Alertas SOS', icon: '🚨' },
  { href: '#vinculo', label: 'Vínculo QR', icon: '🔗' },
  { href: '#perfiles', label: 'Perfiles', icon: '👤' }
];

/**
 * Revela las secciones del lobby al desplazarse (fade + elevación). Sin
 * IntersectionObserver o con movimiento reducido, todo queda visible.
 */
function useRevealOnScroll() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll('[data-reveal]'));

    if (elements.length === 0) {
      return undefined;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);
}

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [seniors, setSeniors] = useState([]);
  const [selectedSeniorId, setSelectedSeniorId] = useState('');
  const [error, setError] = useState(null);
  const [activeSosCount, setActiveSosCount] = useState(0);
  const [routineEntries, setRoutineEntries] = useState({});

  const loadSeniors = useCallback(async () => {
    try {
      const linked = await listLinkedSeniors();
      setSeniors(linked);
      setSelectedSeniorId((current) => current || linked[0]?.id || '');
      setError(null);
    } catch (caught) {
      setError(caught.message);
    }
  }, []);

  useEffect(() => {
    loadSeniors();
  }, [loadSeniors]);

  useRevealOnScroll();

  // Rutinas reportadas por las tarjetas de resumen (ya cargan cada rutina):
  // alimentan el total de actividades del hero y la línea del día.
  const handleRoutineReport = useCallback((senior, routine) => {
    setRoutineEntries((current) => ({ ...current, [senior.id]: { senior, routine } }));
  }, []);

  const handleSosCountChange = useCallback((count) => setActiveSosCount(count), []);

  const routineEntryList = useMemo(() => Object.values(routineEntries), [routineEntries]);
  const activitiesToday = routineEntryList.reduce(
    (total, entry) => total + (entry.routine?.progress?.total ?? 0),
    0
  );

  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const dateLabel = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const navLinks = NAV_LINKS.map((link) =>
    link.href === '#sos' && activeSosCount > 0
      ? { ...link, badgeCount: activeSosCount }
      : link
  );

  return (
    <PageShell
      topbar={<AppTopbar links={navLinks} userInitial={firstName.charAt(0) || undefined} onExit={logout} />}
      hero={
        <LobbyHero
          eyebrow="Panel del cuidador"
          title={firstName ? `Hola, ${firstName} 👋` : 'Hola 👋'}
          subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
          stats={[
            {
              value: activeSosCount,
              label: 'Alertas SOS activas',
              tone: activeSosCount > 0 ? 'alert' : undefined
            },
            { value: activitiesToday, label: 'Actividades de hoy' },
            { value: seniors.length, label: 'Personas a tu cargo' }
          ]}
          primaryLabel="＋ Nueva actividad"
          primaryHref="#rutina"
        />
      }
    >
      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="lobby-section reveal" id="sos" data-reveal>
        <SosAlertPanel onActiveCountChange={handleSosCountChange} />
      </div>

      <div className="lobby-section reveal" id="personas" data-reveal>
        <section className="card">
          <h2 className="card__title">Personas a tu cargo</h2>

          {seniors.length === 0 ? (
            <p> Todavía no hay nadie vinculado. Generá el QR y escaneálo desde el teléfono del adulto mayor.</p>
          ) : null}

          <p>
            <PrimaryButton variant="secondary" onClick={loadSeniors}>
              Actualizar lista
            </PrimaryButton>
          </p>
        </section>

        <SeniorOverviewCards seniors={seniors} onRoutineReport={handleRoutineReport} />
      </div>

      <div className="lobby-section reveal" id="rutina" data-reveal>
        <DailyTimeline entries={routineEntryList} />

        <section className="card">
          <h2 className="card__title">Nueva actividad</h2>

          {seniors.length > 0 && !selectedSeniorId ? (
            <p className="card__hint">Elegí para quién es la actividad usando la lista de arriba.</p>
          ) : null}

          {selectedSeniorId ? (
            <ActivityComposer seniorId={selectedSeniorId} />
          ) : null}
        </section>
      </div>

      <div className="lobby-panels">
        <div className="lobby-section reveal" id="vinculo" data-reveal>
          <PairingQrPanel />
        </div>

        <div className="lobby-section reveal" id="perfiles" data-reveal>
          <SeniorProfilePanel />
        </div>
      </div>
    </PageShell>
  );
}
