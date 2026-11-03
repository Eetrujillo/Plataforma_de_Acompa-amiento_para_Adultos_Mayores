import { useState } from 'react';

import { createPairingCode } from '../application/pairingApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';

export function PairingCodePanel() {
  const [pairing, setPairing] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);

    try {
      setPairing(await createPairingCode());
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Vincular un adulto mayor</h2>
      <p className="card__hint">
        Generá un código de 6 dígitos, o mostrá el QR. Se usa una sola vez y vence a los 15 minutos.
      </p>

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      <PrimaryButton onClick={handleGenerate} disabled={pending}>
        {pending ? 'Generando…' : 'Generar código'}
      </PrimaryButton>

      {pairing ? (
        <div>
          <p className="code-display" aria-label={`Código de vinculación ${pairing.code}`}>
            {pairing.code}
          </p>
          <p className="muted">
            Vence a las{' '}
            {new Date(pairing.expiresAt).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit'
            })}
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
