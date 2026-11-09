import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../features/auth/application/AuthContext.jsx';
import { listLinkedSeniors } from '../../features/pairing/application/pairingApi.js';
import { PairingQrPanel } from '../../features/pairing/ui/PairingQrPanel.jsx';
import { SeniorProfilePanel } from '../../features/seniors/ui/caregiver/SeniorProfilePanel.jsx';
import { ActivityComposer } from '../../features/activities/ui/caregiver/ActivityComposer.jsx';
import { SeniorOverviewCards } from '../../features/activities/ui/caregiver/SeniorOverviewCards.jsx';
import { SosAlertPanel } from '../../features/sos_emergency/ui/caregiver/SosAlertPanel.jsx';
import { PageShell } from '../../shared/components/PageShell.jsx';
import { PrimaryButton } from '../../shared/components/PrimaryButton.jsx';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const [seniors, setSeniors] = useState([]);
  const [selectedSeniorId, setSelectedSeniorId] = useState('');
  const [error, setError] = useState(null);

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

  return (
    <PageShell
      eyebrow="Panel del cuidador"
      title={`Hola, ${user?.fullName ?? ''}`}
      actions={
        <PrimaryButton variant="secondary" onClick={logout}>
          Salir
        </PrimaryButton>
      }
    >
      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      <SosAlertPanel />

      <SeniorProfilePanel />

      <PairingQrPanel />

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

      <SeniorOverviewCards seniors={seniors} />

      <section className="card">
        <h2 className="card__title">Nueva actividad</h2>

        {seniors.length > 0 && !selectedSeniorId ? (
          <p className="card__hint">Elegí para quién es la actividad usando la lista de arriba.</p>
        ) : null}

        {selectedSeniorId ? (
          <ActivityComposer seniorId={selectedSeniorId} />
        ) : null}
      </section>
    </PageShell>
  );
}
