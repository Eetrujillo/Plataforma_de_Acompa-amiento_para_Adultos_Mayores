import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Notification } from '../components/ui/Notification';
import { useAuth } from '../hooks/useAuth';
import { useResendVerification } from '../hooks/useResendVerification';
import { setToken } from '../services/apiClient';
import { authService } from '../services/authService';
import { formatWait } from '../utils/time';

export function VerificationRequiredPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { resend, resending, message, error, retryAfterSeconds } = useResendVerification();
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState('');

  const requestedPath = (location.state as { from?: string } | null)?.from;
  const from = requestedPath && requestedPath !== '/verificar-correo' ? requestedPath : '/';

  useEffect(() => {
    if (user?.emailVerified) {
      navigate(from, { replace: true });
    }
  }, [user?.emailVerified, from, navigate]);

  useEffect(() => {
    function handleFocus() {
      void refreshUser();
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshUser]);

  if (!user) return null;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  async function handleResend() {
    if (!user || resending || retryAfterSeconds > 0) return;
    await resend(user.email);
  }

  /**
   * Atajo de desarrollo: sin SMTP el enlace solo aparece en la consola del
   * backend. La ruta no existe cuando el backend corre en producción.
   */
  async function handleDevConfirm() {
    if (!user || devBusy) return;

    setDevBusy(true);
    setDevError('');

    try {
      const response = await authService.devVerifyEmail(user.email);
      setToken(response.token);
      await refreshUser();
    } catch {
      setDevError('No se pudo confirmar en modo desarrollo. Revisa el servidor.');
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Acceso limitado</p>
        <h1>Confirma tu correo para continuar</h1>

        <div className="auth-form">
          <Notification type="warning">
            Por seguridad, las funciones de la plataforma están restringidas hasta que confirmes tu
            correo electrónico. Así protegemos la información del adulto mayor y de su familia.
          </Notification>

          <p className="auth-subtitle">
            El enlace de confirmación se envía a <strong>{user.email}</strong>. Revisa tu bandeja de
            entrada y la carpeta de spam.
          </p>

          <button
            className="btn-primary"
            type="button"
            onClick={handleResend}
            disabled={resending || retryAfterSeconds > 0}
          >
            {resending
              ? 'Enviando…'
              : retryAfterSeconds > 0
                ? `Espera ${formatWait(retryAfterSeconds)}`
                : 'Reenviar correo de confirmación'}
          </button>

          {message ? <Notification type="success">{message}</Notification> : null}
          {error ? <Notification type="error">{error}</Notification> : null}

          <p className="auth-switch">
            ¿Ya confirmaste?{' '}
            <button className="btn-inline" type="button" onClick={() => void refreshUser()}>
              Actualizar estado
            </button>
          </p>

          {import.meta.env.DEV ? (
            <>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void handleDevConfirm()}
                disabled={devBusy}
              >
                {devBusy ? 'Confirmando…' : 'Confirmar correo ahora (desarrollo)'}
              </button>
              {devError ? <Notification type="error">{devError}</Notification> : null}
            </>
          ) : null}

          <button className="btn-secondary" type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </section>
    </main>
  );
}
