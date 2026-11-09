import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { resetPasswordRequest } from '../application/authApi.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Elige la contraseña nueva a partir del enlace del correo.
 *
 * No se valida la contraseña en el cliente más allá de lo obvio: la regla de verdad
 * (mínimo 8, letras y números) la aplica el backend, y si la rechaza el enlace NO se
 * quema, así que la persona puede corregir y reintentar en esta misma pantalla.
 */
export function ResetPasswordScreen() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const mismatch = repeated.length > 0 && password !== repeated;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (password !== repeated) {
      setError('Las dos contraseñas tienen que ser iguales.');
      return;
    }

    setPending(true);

    try {
      await resetPasswordRequest(token, password);
      setDone(true);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <PageShell eyebrow="Recuperar acceso" title="Enlace incompleto">
        <section className="card">
          <p className="alert alert--error" role="alert">
            Este enlace no trae el código de restablecimiento. Pedí uno nuevo desde el ingreso.
          </p>
          <Link className="muted" to="/forgot-password">
            Pedir un enlace nuevo
          </Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Recuperar acceso" title="Elegí tu contraseña nueva">
      <section className="card">
        {done ? (
          <>
            <p className="alert alert--success" role="status">
              Listo, tu contraseña cambió. Por seguridad cerramos las sesiones que estaban abiertas
              con la contraseña anterior.
            </p>
            <Link className="muted" to="/login">
              Ir a iniciar sesión
            </Link>
          </>
        ) : (
          <form className="stack" onSubmit={handleSubmit} noValidate>
            {error ? (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            ) : null}

            <FormField
              id="password"
              label="Contraseña nueva"
              type="password"
              autoComplete="new-password"
              hint="Mínimo 8 caracteres, con letras y números."
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <FormField
              id="repeated"
              label="Repetí la contraseña"
              type="password"
              autoComplete="new-password"
              required
              value={repeated}
              onChange={(event) => setRepeated(event.target.value)}
            />

            {tooShort ? (
              <p className="muted" role="status">
                Faltan caracteres: el mínimo es {MIN_PASSWORD_LENGTH}.
              </p>
            ) : null}

            {mismatch ? (
              <p className="muted" role="status">
                Las contraseñas todavía no coinciden.
              </p>
            ) : null}

            <PrimaryButton
              type="submit"
              block
              disabled={pending || mismatch || password.length === 0}
            >
              {pending ? 'Guardando…' : 'Cambiar mi contraseña'}
            </PrimaryButton>

            <Link className="muted" to="/forgot-password">
              Pedir un enlace nuevo
            </Link>
          </form>
        )}
      </section>
    </PageShell>
  );
}
