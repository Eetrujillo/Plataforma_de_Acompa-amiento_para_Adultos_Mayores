import { useState } from 'react';

import { useAuth } from '../application/AuthContext.jsx';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

export function LoginScreen() {
  const { login, pending, error } = useAuth();
  const [credentials, setCredentials] = useState({ email: '', password: '' });

  function handleChange(event) {
    const { name, value } = event.target;
    setCredentials((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await login(credentials);
  }

  return (
    <PageShell eyebrow="Acceso" title="Ingresá a tu cuenta">
      <section className="card">
        {error ? (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="stack" onSubmit={handleSubmit} noValidate>
          <FormField
            id="email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            value={credentials.email}
            onChange={handleChange}
          />

          <FormField
            id="password"
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={credentials.password}
            onChange={handleChange}
          />

          <PrimaryButton type="submit" block disabled={pending}>
            {pending ? 'Ingresando…' : 'Ingresar'}
          </PrimaryButton>
        </form>
      </section>

      <p className="muted">
        Los familiares crean la cuenta desde la web. El adulto mayor se vincula escaneando el código
        que genera su cuidador.
      </p>
    </PageShell>
  );
}
