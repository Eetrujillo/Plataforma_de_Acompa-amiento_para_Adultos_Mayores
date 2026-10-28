import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useLoginFeedback } from '../../hooks/useLoginFeedback';
import { formatWait } from '../../utils/time';
import { FormField } from '../ui/FormField';
import { Notification } from '../ui/Notification';

export function SessionExpiredModal() {
  const { user, sessionExpired, login, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { error, retryAfterSeconds, lockedEmail, reportError, clearError } = useLoginFeedback();

  useEffect(() => {
    if (!sessionExpired) return;
    setPassword('');
    setValidationError('');
    clearError();
  }, [sessionExpired, clearError]);

  useEffect(() => {
    if (!sessionExpired || !user) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sessionExpired, user]);

  if (!sessionExpired || !user) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const isLocked = retryAfterSeconds > 0 && lockedEmail === normalizedEmail;
  const visibleError = validationError || error;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLocked) return;

    setValidationError('');
    clearError();

    if (!password) {
      setValidationError('Ingresa tu contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: normalizedEmail, password });
      setPassword('');
    } catch (err) {
      reportError(err, normalizedEmail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal-card session-expired-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
      >
        <p className="eyebrow">Sesión vencida</p>
        <h2 id="session-expired-title">Ingresa de nuevo para continuar</h2>
        <p className="auth-subtitle">
          Por seguridad, tu sesión venció. El formulario que estabas llenando se conserva.
        </p>

        <p className="session-account">
          Cuenta: <strong>{user.email}</strong>
        </p>

        <Notification type="error">{visibleError}</Notification>

        {isLocked ? (
          <Notification type="warning">
            Tiempo restante para volver a intentar: {formatWait(retryAfterSeconds)}
          </Notification>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            label="Contraseña"
            name="session-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setValidationError('');
              setPassword(event.target.value);
            }}
            autoFocus
            required
          />

          <button className="btn-primary" type="submit" disabled={submitting || isLocked}>
            {submitting
              ? 'Ingresando…'
              : isLocked
                ? `Espera ${formatWait(retryAfterSeconds)}`
                : 'Ingresar de nuevo'}
          </button>
        </form>

        <p className="modal-help">
          ¿Quieres usar otra cuenta?{' '}
          <button className="btn-inline" type="button" onClick={logout} disabled={submitting}>
            Cierra sesión
          </button>{' '}
          e inicia con la cuenta que necesites.
        </p>
      </section>
    </div>
  );
}
