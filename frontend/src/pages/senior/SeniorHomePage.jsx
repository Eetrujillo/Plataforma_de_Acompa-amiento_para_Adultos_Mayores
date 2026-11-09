import { useAuth } from '../../features/auth/application/AuthContext.jsx';
import { PairingLinkForm } from '../../features/pairing/ui/PairingLinkForm.jsx';
import { DailyRoutineList } from '../../features/activities/ui/senior/DailyRoutineList.jsx';
import { useDailyRoutine } from '../../features/activities/application/useDailyRoutine.js';
import { SosButton } from '../../features/sos_emergency/ui/senior/SosButton.jsx';
import { PageShell } from '../../shared/components/PageShell.jsx';
import { PrimaryButton } from '../../shared/components/PrimaryButton.jsx';

/**
 * Senior entry point. An unlinked device first pairs by scanning the QR the caregiver generates in
 * her panel; once linked, the same route shows the emergency button and today's routine.
 */
export function SeniorHomePage() {
  const { user } = useAuth();

  if (!user) {
    return <PairingLinkForm />;
  }

  return <SeniorDashboard user={user} />;
}

function SeniorDashboard({ user }) {
  const { logout } = useAuth();
  const { routine, loading, error, busyActivityId, reload, complete } = useDailyRoutine({
    seniorId: user.id
  });

  const firstName = typeof user.fullName === 'string' ? user.fullName.split(' ')[0] : '';

  return (
    <PageShell
      eyebrow="Mi día"
      title={`Hola, ${firstName}`}
      actions={
        <PrimaryButton variant="secondary" onClick={logout}>
          Salir
        </PrimaryButton>
      }
    >
      <section className="card" aria-labelledby="sos-heading">
        <h2 id="sos-heading">¿Necesitás ayuda?</h2>
        <SosButton />
      </section>

      <section className="card" aria-labelledby="routine-heading">
        <h2 id="routine-heading">Mi rutina de hoy</h2>
        <DailyRoutineList
          routine={routine}
          loading={loading}
          error={error}
          busyActivityId={busyActivityId}
          onComplete={complete}
          onReload={reload}
        />
      </section>
    </PageShell>
  );
}
