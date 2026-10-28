import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { PASSWORD_RULE_MESSAGE, validatePassword } from '../utils/validators';

const TOKEN_ERROR_CODES = new Set([
  'RESET_TOKEN_EXPIRED',
  'RESET_TOKEN_USED',
  'RESET_TOKEN_INVALID',
]);

const MISSING_TOKEN_MESSAGE =
  'El enlace no incluye un token válido. Solicita uno nuevo.';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasToken = Boolean(token);

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value);
    setPasswordError('');
  }

  function handleConfirmChange(event: ChangeEvent<HTMLInputElement>) {
    setConfirmPassword(event.target.value);
    setConfirmError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPasswordError('');
    setConfirmError('');

    if (!hasToken) {
      setTokenError(MISSING_TOKEN_MESSAGE);
      return;
    }

    const ruleError = validatePassword(password);
    if (ruleError) {
      setPasswordError(ruleError);
      return;
    }

    if (confirmPassword !== password) {
      setConfirmError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authService.resetPassword(token, password);

      // El cambio incrementa tokenVersion en el backend: la sesión actual
      // también queda invalidada, así que se elimina el token local.
      logout();
      setPassword('');
      setConfirmPassword('');
      setSuccess(response.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code && TOKEN_ERROR_CODES.has(err.code)) {
          setTokenError(err.message);
          return;
        }

        if (err.code === 'WEAK_PASSWORD') {
          setPasswordError(err.message);
          return;
        }

        setError(err.message);
        return;
      }

      setError('No pudimos actualizar tu contraseña. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <p className="eyebrow">Contraseña actualizada</p>
          <h1>Tu contraseña fue actualizada</h1>

          <Notification type="success">{success}</Notification>

          <p className="auth-subtitle">
            Por seguridad, cerramos las sesiones anteriores. Inicia sesión con tu nueva
            contraseña.
          </p>

          <p className="auth-switch">
            <Link className="btn-primary" to="/login">
              Iniciar sesión
            </Link>
          </p>
        </section>
      </main>
    );
  }

  if (!hasToken || tokenError) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <p className="eyebrow">Restablecer contraseña</p>
          <h1>No pudimos usar este enlace</h1>

          <Notification type="error">
            {tokenError || MISSING_TOKEN_MESSAGE}
          </Notification>

          <p className="auth-subtitle">
            Solicita un nuevo enlace para definir tu contraseña.
          </p>

          <p className="auth-switch">
            <Link className="btn-primary" to="/recuperar-contrasena">
              Solicitar otro enlace
            </Link>
          </p>

          <p className="auth-switch">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Restablecer contraseña</p>
        <h1>Define tu nueva contraseña</h1>
        <p className="auth-subtitle">
          La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Notification type="error">{error}</Notification>

          <FormField
            label="Nueva contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={handlePasswordChange}
            error={passwordError}
            hint={PASSWORD_RULE_MESSAGE}
            required
          />

          <FormField
            label="Confirmar contraseña"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={handleConfirmChange}
            error={confirmError}
            required
          />

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </section>
    </main>
  );
}
