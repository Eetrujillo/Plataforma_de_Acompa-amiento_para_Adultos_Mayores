import { useState } from 'react';

import { linkSenior } from '../application/pairingApi.js';
import { useAuth } from '../../auth/application/AuthContext.jsx';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

/**
 * First run on the senior device: the caregiver's 6 digit code is the credential.
 */
export function PairingLinkForm() {
  const { startSession } = useAuth();
  const [form, setForm] = useState({ code: '', fullName: '', phone: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === 'code' ? value.replace(/\D/g, '') : value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await linkSenior(form);
      startSession({ token: result.token, user: result.senior });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell eyebrow="Primeros pasos" title="Vinculá este teléfono">
      <section className="card">
        <p className="card__hint">
          Pedile a tu familiar el código de 6 dígitos que aparece en su panel.
        </p>

        {error ? (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="stack" onSubmit={handleSubmit} noValidate>
          <FormField
            id="code"
            label="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={form.code}
            onChange={handleChange}
          />

          <FormField
            id="fullName"
            label="Tu nombre y apellido"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={handleChange}
          />

          <FormField
            id="phone"
            label="Teléfono (opcional)"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={handleChange}
          />

          <PrimaryButton type="submit" block disabled={pending}>
            {pending ? 'Vinculando…' : 'Vincular este teléfono'}
          </PrimaryButton>
        </form>
      </section>
    </PageShell>
  );
}
