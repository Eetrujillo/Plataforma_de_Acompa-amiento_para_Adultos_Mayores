import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../application/AuthContext.jsx';
import {
  fetchGoogleConfig,
  googleLoginRequest,
  resendVerificationRequest
} from '../application/authApi.js';
import { GoogleSignInButton } from './GoogleSignInButton.jsx';
import { LoginIllustration } from './LoginIllustration.jsx';
import { PrimaryButton } from '../../../shared/components/PrimaryButton.jsx';

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
      <rect
        x="5"
        y="10.5"
        width="14"
        height="10"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
      <path
        d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off ? (
        <path
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="22" height="22">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

export function LoginScreen() {
  const { login, startSession, pending, error } = useAuth();
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  const [googleClientId, setGoogleClientId] = useState(null);
  const [googleError, setGoogleError] = useState(null);
  const [googlePending, setGooglePending] = useState(false);

  useEffect(() => {
    let active = true;

    fetchGoogleConfig()
      .then((config) => {
        if (active) {
          setGoogleClientId(config?.clientId || null);
        }
      })
      .catch(() => {
        // A missing config (or an unreachable endpoint) just hides Google.
        if (active) {
          setGoogleClientId(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setCredentials((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setResendStatus(null);
    setGoogleError(null);

    const started = await login({ ...credentials, remember });

    // Without this the session exists but the user stays looking at the form.
    if (started) {
      navigate('/caregiver', { replace: true });
    }
  }

  async function handleGoogleCredential(idToken) {
    setGoogleError(null);
    setGooglePending(true);

    try {
      const result = await googleLoginRequest(idToken);
      startSession(result, { persist: remember });
      navigate('/caregiver', { replace: true });
    } catch (caught) {
      setGoogleError({ message: caught.message, code: caught.code ?? 'UNKNOWN' });
    } finally {
      setGooglePending(false);
    }
  }

  function handleForgot() {
    navigate('/forgot-password');
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
    <main className="login">
      <section className="login__card">
        <div className="login__illustration">
          <LoginIllustration />
        </div>

        <h1 className="login__title">Cuidamos tu bienestar</h1>
        <p className="login__subtitle">
          Seguimiento, medicamentos y acompañamiento, en un solo lugar.
        </p>

        {error ? (
          <p className="alert alert--error" role="alert">
            {error.message}
          </p>
        ) : null}
        {googleError ? (
          <p className="alert alert--error" role="alert">
            {googleError.message}
            {googleError.code === 'EMAIL_NOT_REGISTERED' ? (
              <>
                {' '}
                <Link to="/register">Creá tu cuenta</Link>.
              </>
            ) : null}
          </p>
        ) : null}
        {resendStatus ? (
          <p className="alert alert--success" role="status">
            {resendStatus}
          </p>
        ) : null}

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <div className="login__field">
            <label className="sr-only" htmlFor="email">
              Correo electrónico
            </label>
            <span className="login__input-icon" aria-hidden="true">
              <PersonIcon />
            </span>
            <input
              className="login__input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Correo electrónico"
              required
              value={credentials.email}
              onChange={handleChange}
            />
          </div>

          <div className="login__field">
            <label className="sr-only" htmlFor="password">
              Contraseña
            </label>
            <span className="login__input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input
              className="login__input login__input--with-action"
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Contraseña"
              required
              value={credentials.password}
              onChange={handleChange}
            />
            <button
              type="button"
              className="login__eye"
              onClick={() => setShowPassword((current) => !current)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>

          <div className="login__meta">
            <label className="login__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Recordarme
            </label>
            <div className="login__forgot">
              <button type="button" className="login__forgot-button" onClick={handleForgot}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>

          <PrimaryButton type="submit" block className="login__submit" disabled={pending}>
            <span>{pending ? 'Ingresando…' : 'Iniciar sesión'}</span>
            <span aria-hidden="true">→</span>
          </PrimaryButton>

          {needsVerification ? (
            <PrimaryButton variant="secondary" block onClick={handleResend}>
              Reenviar el correo de verificación
            </PrimaryButton>
          ) : null}
        </form>

        <div className="login__divider" role="presentation">
          <span>o continúa con</span>
        </div>

        <div
          id="google-signin-slot"
          className="login__google-slot"
          data-configured={googleClientId ? 'true' : 'false'}
        >
          {googleClientId ? (
            <GoogleSignInButton
              clientId={googleClientId}
              disabled={googlePending || pending}
              onCredential={handleGoogleCredential}
            />
          ) : (
            <button type="button" className="login__google-button" disabled>
              <GoogleIcon />
              <span>Google no está disponible todavía</span>
            </button>
          )}
        </div>

        <p className="login__footer">
          ¿No tienes una cuenta? <Link to="/register">Registrate</Link>
        </p>
      </section>
    </main>
  );
}
