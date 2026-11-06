import { useCallback, useEffect, useState } from 'react';

import { generatePairingQr } from '../application/pairingApi.js';
import { listSeniorProfiles } from '../../seniors/application/seniorsApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';

/**
 * Un perfil sin `linkStatus` es anterior a HU-005 y ya está vinculado: solo `PENDING` se ofrece.
 */
function isPendingProfile(profile) {
  return profile.linkStatus === 'PENDING';
}

/** Tamaño en pantalla: el QR se escanea a distancia, así que no se achica más que esto. */
const QR_SIZE = 320;

const QR_IMAGE_STYLE = Object.freeze({
  width: `${QR_SIZE}px`,
  maxWidth: '100%',
  minWidth: '240px',
  height: 'auto',
  imageRendering: 'pixelated',
  background: '#fff'
});

/**
 * QR de vinculación de un perfil concreto (HU-006 S7, rework QR-only de L9).
 *
 * No hay código que mostrar, dictar ni tipear: el token vive sólo dentro de la imagen. La vigencia
 * se muestra desde `expiresAt`, nunca escrita a mano.
 */
export function PairingQrPanel() {
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
      // El perfil elegido puede haber dejado de estar pendiente (se vinculó con otro QR):
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

  /**
   * Pide un QR nuevo para el perfil elegido. Lo usan el submit y el reintento: el backend no deja
   * ningún QR viejo vivo cuando falla, así que reintentar es la única salida (y es segura).
   */
  const requestQr = useCallback(
    async (targetSeniorId) => {
      // Doble pedido: el botón ya se deshabilita, pero un doble submit por teclado puede entrar
      // antes del re-render y generaría dos tokens (el primero quedaría invalidado).
      if (pending || targetSeniorId === '') {
        return;
      }

      setPending(true);
      setError(null);
      setPairing(null);

      try {
        setPairing(await generatePairingQr({ seniorId: targetSeniorId }));
      } catch (caught) {
        setError(caught);

        // El perfil pasó a vinculado mientras el panel lo ofrecía: refrescamos para que deje de
        // aparecer como pendiente (el mensaje del backend ya dice qué pasó).
        if (caught.code === 'SENIOR_ALREADY_LINKED') {
          await loadProfiles();
        }
      } finally {
        setPending(false);
      }
    },
    [loadProfiles, pending]
  );

  function handleSubmit(event) {
    event.preventDefault();
    requestQr(seniorId);
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

  // El backend puede contestar 201 con `qrCodeDataUrl: null` (el codificador falló y no escribe
  // nada), o directamente 503 si falló antes de tocar el token. En los dos casos no hay credencial
  // que entregar: se avisa y se ofrece reintentar.
  const qrMissing = Boolean(pairing) && !pairing.qrCodeDataUrl;
  const qrUnavailable = qrMissing || error?.code === 'PAIRING_QR_UNAVAILABLE';

  return (
    <section className="card">
      <h2 className="card__title">Vincular un adulto mayor</h2>
      <p className="card__hint">
        Elegí el perfil que querés vincular y generá su QR. El adulto mayor lo escanea con el
        teléfono. Se usa una sola vez y vence a las 24 horas.
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
            ? 'Todavía no cargaste ningún perfil. Cargalo en "Mi adulto mayor" y después volvé acá a generar el QR.'
            : 'Todos tus perfiles ya están vinculados. Si querés vincular otro teléfono, primero cargá un perfil nuevo.'}
        </p>
      ) : null}

      {error && !qrUnavailable ? (
        <p className="alert alert--error" role="alert">
          {error.message}
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
            {pending ? 'Generando…' : 'Generar QR'}
          </PrimaryButton>
        </form>
      ) : null}

      {qrUnavailable ? (
        <div className="stack">
          <p className="alert alert--error" role="alert">
            No pudimos generar el QR. Probá de nuevo en unos segundos.
          </p>
          <PrimaryButton
            variant="secondary"
            onClick={() => requestQr(seniorId)}
            disabled={pending || seniorId === ''}
          >
            {pending ? 'Generando…' : 'Reintentar'}
          </PrimaryButton>
        </div>
      ) : null}

      {pairing?.qrCodeDataUrl ? (
        <div className="stack">
          <img
            src={pairing.qrCodeDataUrl}
            alt={`Código QR para vincular el teléfono de ${pairedProfile?.fullName ?? 'tu adulto mayor'}`}
            width={QR_SIZE}
            height={QR_SIZE}
            style={QR_IMAGE_STYLE}
          />
          <p className="muted" role="status">
            {pairedProfile ? `QR de ${pairedProfile.fullName}. ` : ''}
            Vence el {expiresDate} a las {expiresTime}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
