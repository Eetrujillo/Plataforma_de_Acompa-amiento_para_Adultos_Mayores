import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { useAuth } from '../hooks/useAuth';
import { useResendVerification } from '../hooks/useResendVerification';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { formatWait } from '../utils/time';
import { EMAIL_INVALID_MESSAGE, validateEmail } from '../utils/validators';

type PageStatus = 'loading' | 'success' | 'error';

export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [message, setMessage] = useState('Estamos confirmando tu correo…');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const attemptedToken = useRef<string | null>(null);
  const {
    resend,
    resending,
    message: resendMessage,
    error: resendError,
    retryAfterSeconds,
  } = useResendVerification();

  useEffect(() => {
    if (attemptedToken.current === token) return;
    attemptedToken.current = token;

    if (!token) {
      setStatus('error');
      setMessage('El enlace no incluye un token válido. Solicita uno nuevo.');
      return;
    }

    authService
      .verifyEmail(token)
      .then((response) => {
        setStatus('success');
        setMessage(response.message);

        if (authService.hasToken()) {
          void refreshUser();
        }
      })
      .catch((err) => {
        setStatus('error');
        if (err instanceof ApiError) {
          setMessage(err.message);
        } else {
          setMessage('No pudimos confirmar tu correo. Inténtalo de nuevo.');
        }
      });
  }, [token, refreshUser]);

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    setEmailError('');
  }

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateEmail(email)) {
      setEmailError(EMAIL_INVALID_MESSAGE);
      return;
    }

    if (resending || retryAfterSeconds > 0) return;

    await resend(email.trim().toLowerCase());
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Confirmación de correo</p>
        <h1>Confirmar mi correo</h1>

        {status === 'loading' ? (
          <p className="auth-subtitle" role="status">
            {message}
          </p>
        ) : null}

        {status === 'success' ? (
          <>
            <Notification type="success">{message}</Notification>
            <p className="auth-subtitle">Ya puedes usar tu cuenta con normalidad.</p>
            <p className="auth-switch">
              <Link className="btn-primary" to={user ? '/' : '/login'}>
                {user ? 'Ir al panel' : 'Ir a iniciar sesión'}
              </Link>
            </p>
          </>
        ) : null}

        {status === 'error' ? (
          <>
            <Notification type="error">{message}</Notification>

            <form className="auth-form" onSubmit={handleResend} noValidate>
              <p className="auth-subtitle">Solicita un nuevo enlace de confirmación.</p>

              <FormField
                label="Correo electrónico"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                error={emailError}
                required
              />

              <button
                className="btn-primary"
                type="submit"
                disabled={resending || retryAfterSeconds > 0}
              >
                {resending
                  ? 'Enviando…'
                  : retryAfterSeconds > 0
                    ? `Espera ${formatWait(retryAfterSeconds)}`
                    : 'Solicitar nuevo enlace'}
              </button>

              {resendMessage ? <Notification type="success">{resendMessage}</Notification> : null}
              {resendError ? <Notification type="error">{resendError}</Notification> : null}
            </form>

            <p className="auth-switch">
              <Link to={user ? '/verificar-correo' : '/login'}>
                {user ? 'Volver a mi cuenta' : 'Volver a iniciar sesión'}
              </Link>
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
