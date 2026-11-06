import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../features/auth/application/AuthContext.jsx';
import { listLinkedSeniors } from '../../features/pairing/application/pairingApi.js';
import { PairingCodePanel } from '../../features/pairing/ui/PairingCodePanel.jsx';
import { SeniorProfilePanel } from '../../features/seniors/ui/caregiver/SeniorProfilePanel.jsx';
import { ActivityComposer } from '../../features/activities/ui/caregiver/ActivityComposer.jsx';
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

      <PairingCodePanel />

      <section className="card">
        <h2 className="card__title">Personas a tu cargo</h2>

        {seniors.length === 0 ? (
          <p> Todavía no hay nadie vinculado. Generá un código y usalo en el teléfono del adulto mayor.</p>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="seniorId">
              Adulto mayor
            </label>
            <select
              className="field__input"
              id="seniorId"
              name="seniorId"
              value={selectedSeniorId}
              onChange={(event) => setSelectedSeniorId(event.target.value)}
            >
              {seniors.map((senior) => (
                <option key={senior.id} value={senior.id}>
                  {senior.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        <p>
          <PrimaryButton variant="secondary" onClick={loadSeniors}>
            Actualizar lista
          </PrimaryButton>
        </p>
      </section>

      {selectedSeniorId ? <ActivityComposer seniorId={selectedSeniorId} /> : null}
    </PageShell>
  );
}
