import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../application/AuthContext.jsx';
import { resendVerificationRequest } from '../application/authApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

export function LoginScreen() {
  const { login, pending, error } = useAuth();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [resendStatus, setResendStatus] = useState(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setCredentials((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setResendStatus(null);
    await login(credentials);
  }

  async function handleResend() {
    try {
      await resendVerificationRequest(credentials.email);
      setResendStatus('Si la cuenta existe y está sin verificar, te enviamos un enlace nuevo.');
    } catch {
      setResendStatus('No pudimos reenviar el correo. Intentá de nuevo en unos minutos.');
    }
  }

  const needsVerification = error?.code === 'EMAIL_NOT_VERIFIED';

  return (
    <PageShell eyebrow="Acceso" title="Ingresá a tu cuenta">
      <section className="card">
        {error ? (
          <p className="alert alert--error" role="alert">
            {error.message}
          </p>
        ) : null}
        {resendStatus ? (
          <p className="alert alert--success" role="status">
            {resendStatus}
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

          {needsVerification ? (
            <PrimaryButton variant="secondary" block onClick={handleResend}>
              Reenviar el correo de verificación
            </PrimaryButton>
          ) : null}
        </form>
      </section>

      <p>
        ¿Todavía no tenés cuenta? <Link to="/register">Creala acá</Link>.
      </p>
      <p className="muted">
        Los familiares crean la cuenta desde la web. El adulto mayor se vincula escaneando el código
        que genera su cuidador.
      </p>
    </PageShell>
  );
}
