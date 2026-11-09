import { useState } from 'react';
import { Link } from 'react-router-dom';

import { registerRequest, resendVerificationRequest } from '../application/authApi.js';
import { TERMS_VERSION } from '../../../app/config/runtime.js';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../shared/components/FormField.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

// Unchecked on purpose: a pre-checked box is not valid consent under Ley 1581 (SIC).
const EMPTY_FORM = { fullName: '', email: '', password: '', phone: '', acceptedTerms: false };

export function RegisterScreen() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [registeredEmail, setRegisteredEmail] = useState(null);
  const [verificationSent, setVerificationSent] = useState(true);
  const [notice, setNotice] = useState(null);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await registerRequest(form);
      setRegisteredEmail(form.email);
      setVerificationSent(result.verificationSent !== false);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    setNotice(null);

    try {
      await resendVerificationRequest(registeredEmail);
      setNotice('Si la cuenta sigue sin verificar, te enviamos un enlace nuevo.');
    } catch {
      setNotice('No pudimos reenviar el correo. Intentá de nuevo en unos minutos.');
    }
  }

  if (registeredEmail) {
    return (
      <PageShell eyebrow="Registro" title="Revisá tu correo">
        <section className="card">
          {verificationSent ? (
            <p className="alert alert--success" role="status">
              Te enviamos un enlace de verificación a <strong>{registeredEmail}</strong>.
            </p>
          ) : (
            <p className="alert alert--error" role="alert">
              La cuenta de <strong>{registeredEmail}</strong> se creó, pero el envío de correo no está
              configurado en el servidor. Avisale a quien administra el sistema para que active el
              SMTP y volvé a pedir el enlace desde acá.
            </p>
          )}

          {verificationSent ? (
            <p>
              Abrí el correo y tocá el botón para activar la cuenta. El enlace vence en 24 horas y se
              puede usar una sola vez.
            </p>
          ) : (
            <p>
              No hace falta que crees la cuenta de nuevo: cuando el SMTP esté activo, usá “Reenviar el
              enlace”.
            </p>
          )}

          {notice ? (
            <p className="alert alert--success" role="status">
              {notice}
            </p>
          ) : null}

          <div className="stack">
            <PrimaryButton variant="secondary" onClick={handleResend}>
              Reenviar el enlace
            </PrimaryButton>
            <Link to="/login">Ya verifiqué, ir a ingresar</Link>
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Registro" title="Creá tu cuenta de cuidador">
      <section className="card">
        <p className="card__hint">
          La cuenta es para el familiar o cuidador. Después vas a generar un QR desde tu panel, y el
          adulto mayor lo escanea con su teléfono para vincularlo.
        </p>

        {error ? (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        ) : null}

        <form className="stack" onSubmit={handleSubmit} noValidate>
          <FormField
            id="fullName"
            label="Nombre y apellido"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={handleChange}
          />

          <FormField
            id="email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            hint="Te vamos a enviar un enlace para verificar la cuenta."
            required
            value={form.email}
            onChange={handleChange}
          />

          <FormField
            id="password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, con letras y números."
            required
            value={form.password}
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

          <div className="field field--check">
            <label className="field__check-label" htmlFor="acceptedTerms">
              <input
                className="field__checkbox"
                id="acceptedTerms"
                name="acceptedTerms"
                type="checkbox"
                required
                checked={form.acceptedTerms}
                onChange={handleChange}
              />
              <span>
                Acepto los términos y autorizo el tratamiento de mis datos personales para
                administrar las rutinas y alertas de mi adulto mayor (versión {TERMS_VERSION}).
              </span>
            </label>
          </div>

          <PrimaryButton type="submit" block disabled={pending || !form.acceptedTerms}>
            {pending ? 'Creando cuenta…' : 'Crear cuenta'}
          </PrimaryButton>
        </form>
      </section>

      <p>
        ¿Ya tenés cuenta? <Link to="/login">Ingresá</Link>.
      </p>
    </PageShell>
  );
}
