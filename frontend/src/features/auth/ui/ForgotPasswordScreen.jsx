import { useState } from 'react';
import { Link } from 'react-router-dom';

import { requestPasswordResetRequest } from '../application/authApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

/**
 * Pide el enlace de restablecimiento.
 *
 * La confirmación es siempre la misma, exista o no la cuenta: el backend no distingue
 * los dos casos y la pantalla tampoco puede hacerlo. Prometer "te enviamos el correo"
 * solo cuando la cuenta existe convertiría esta pantalla en el oráculo que el backend
 * evita.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await requestPasswordResetRequest(email);
      setSent(true);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell eyebrow="Recuperar acceso" title="Olvidé mi contraseña">
      <section className="card">
        {sent ? (
          <>
            <p className="alert alert--success" role="status">
              Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para elegir una
              contraseña nueva. Vence en 60 minutos y se puede usar una sola vez.
            </p>
            <p className="card__hint">
              ¿No llega? Revisá la carpeta de correo no deseado o pedí otro enlace en unos minutos.
            </p>
            <Link className="muted" to="/login">
              ← Volver al ingreso
            </Link>
          </>
        ) : (
          <form className="stack" onSubmit={handleSubmit} noValidate>
            <p className="card__hint">
              Escribí el correo con el que te registraste y te mandamos un enlace para elegir una
              contraseña nueva.
            </p>

            {error ? (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            ) : null}

            <FormField
              id="email"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            {/* Solo `type="submit"`: el form dispara el submit una vez. Con un onClick
                además, cada click haría dos pedidos y gastaría dos cupos del límite. */}
            <PrimaryButton type="submit" block disabled={pending}>
              {pending ? 'Enviando…' : 'Enviarme el enlace'}
            </PrimaryButton>

            <Link className="muted" to="/login">
              ← Volver al ingreso
            </Link>
          </form>
        )}
      </section>
    </PageShell>
  );
}
