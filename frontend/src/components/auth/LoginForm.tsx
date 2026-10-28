import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLoginFeedback } from '../../hooks/useLoginFeedback';
import { formatWait } from '../../utils/time';
import { validateEmail } from '../../utils/validators';
import { FormField } from '../ui/FormField';
import { Notification } from '../ui/Notification';

interface LoginFormState {
  email: string;
  password: string;
}

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<LoginFormState>({ email: '', password: '' });
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { error, retryAfterSeconds, lockedEmail, reportError, clearError } = useLoginFeedback();

  const normalizedEmail = form.email.trim().toLowerCase();
  const isLockedForEmail = retryAfterSeconds > 0 && lockedEmail === normalizedEmail;
  const visibleError =
    validationError || (lockedEmail && lockedEmail !== normalizedEmail ? '' : error);

  const requestedPath = (location.state as { from?: string } | null)?.from;
  const from =
    requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/';

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setValidationError('');
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLockedForEmail) return;

    setValidationError('');
    clearError();

    if (!validateEmail(form.email)) {
      setValidationError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!form.password) {
      setValidationError('Ingresa tu contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: normalizedEmail, password: form.password });
      navigate(from, { replace: true });
    } catch (err) {
      reportError(err, normalizedEmail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <p className="eyebrow">Bienvenido de nuevo</p>
      <h1>Iniciar sesión</h1>
      <p className="auth-subtitle">Accede con el correo y la contraseña de tu cuenta.</p>

      <Notification type="error">{visibleError}</Notification>

      {isLockedForEmail ? (
        <Notification type="warning">
          Tiempo restante para volver a intentar: {formatWait(retryAfterSeconds)}
        </Notification>
      ) : null}

      <FormField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={handleChange}
        required
      />
      <FormField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        value={form.password}
        onChange={handleChange}
        required
      />

      <button className="btn-primary" type="submit" disabled={submitting || isLockedForEmail}>
        {submitting
          ? 'Ingresando…'
          : isLockedForEmail
            ? `Espera ${formatWait(retryAfterSeconds)}`
            : 'Iniciar sesión'}
      </button>

      <p className="auth-switch">
        <Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link>
      </p>

      <p className="auth-switch">
        ¿Aún no tienes cuenta? <Link to="/register">Regístrate</Link>
      </p>
    </form>
  );
}
