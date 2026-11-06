import { useCallback, useEffect, useState } from 'react';

import { createPairingCode } from '../application/pairingApi.js';
import { listSeniorProfiles } from '../../seniors/application/seniorsApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';

/**
 * Un perfil sin `linkStatus` es anterior a HU-005 y ya está vinculado: solo `PENDING` se ofrece.
 */
function isPendingProfile(profile) {
  return profile.linkStatus === 'PENDING';
}

export function PairingCodePanel() {
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profilesError, setProfilesError] = useState(null);
  const [seniorId, setSeniorId] = useState('');
  const [pairing, setPairing] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const pendingProfiles = profiles.filter(isPendingProfile);

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);

    try {
      const loaded = await listSeniorProfiles();
      setProfiles(loaded);
      setProfilesError(null);
      // El perfil elegido puede haber dejado de estar pendiente (se vinculó con otro código):
      // se mantiene solo si sigue disponible y, si no, se elige el primero pendiente.
      setSeniorId((current) => {
        const stillPending = loaded.filter(isPendingProfile);

        if (stillPending.some((profile) => profile.id === current)) {
          return current;
        }

        return stillPending[0]?.id ?? '';
      });
    } catch (caught) {
      setProfilesError(caught.message);
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleSubmit(event) {
    event.preventDefault();

    // Doble pedido: el formulario ya deshabilita el botón, pero un doble submit por teclado
    // puede entrar antes del re-render y generaría dos códigos.
    if (pending || seniorId === '') {
      return;
    }

    setPending(true);
    setError(null);
    setPairing(null);

    try {
      setPairing(await createPairingCode({ seniorId }));
    } catch (caught) {
      setError(caught.message);

      // El perfil pasó a vinculado mientras el panel lo ofrecía: refrescamos para que deje de
      // aparecer como pendiente (el mensaje del backend ya dice qué pasó).
      if (caught.code === 'SENIOR_ALREADY_LINKED') {
        await loadProfiles();
      }
    } finally {
      setPending(false);
    }
  }

  const pairedProfile = pairing
    ? profiles.find((profile) => profile.id === pairing.seniorId)
    : null;
  const expiresAt = pairing ? new Date(pairing.expiresAt) : null;
  const expiresDate = expiresAt
    ? expiresAt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const expiresTime = expiresAt
    ? expiresAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <section className="card">
      <h2 className="card__title">Vincular un adulto mayor</h2>
      <p className="card__hint">
        Elegí el perfil que querés vincular y generá un código de 6 dígitos, o mostrá el QR. Se usa
        una sola vez y vence a las 24 horas.
      </p>

      {profilesError ? (
        <p className="alert alert--error" role="alert">
          {profilesError}
        </p>
      ) : null}

      {loadingProfiles ? <p className="muted">Cargando tus perfiles…</p> : null}

      {!loadingProfiles && !profilesError && pendingProfiles.length === 0 ? (
        <p className="muted">
          {profiles.length === 0
            ? 'Todavía no cargaste ningún perfil. Cargalo en "Mi adulto mayor" y después volvé acá a generar el código.'
            : 'Todos tus perfiles ya están vinculados. Si querés vincular otro teléfono, primero cargá un perfil nuevo.'}
        </p>
      ) : null}

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      {pendingProfiles.length > 0 ? (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="pairingSeniorId">
              Perfil a vincular
            </label>
            <select
              className="field__input"
              id="pairingSeniorId"
              name="pairingSeniorId"
              value={seniorId}
              onChange={(event) => setSeniorId(event.target.value)}
              required
            >
              {pendingProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.fullName}
                </option>
              ))}
            </select>
          </div>

          <PrimaryButton type="submit" disabled={pending || seniorId === ''}>
            {pending ? 'Generando…' : 'Generar código'}
          </PrimaryButton>
        </form>
      ) : null}

      {pairing ? (
        <div className="stack">
          {pairedProfile ? (
            <p className="muted">Código para {pairedProfile.fullName}.</p>
          ) : null}
          <p className="code-display" aria-label={`Código de vinculación ${pairing.code}`}>
            {pairing.code}
          </p>
          <p className="muted" role="status">
            Vence el {expiresDate} a las {expiresTime}.
          </p>
          {pairing.qrCodeDataUrl ? (
            <img
              src={pairing.qrCodeDataUrl}
              alt={`Código QR para vincular con el código ${pairing.code}`}
              width="240"
              height="240"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
