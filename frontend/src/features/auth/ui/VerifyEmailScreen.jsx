import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { verifyEmailRequest } from '../application/authApi.js';
import { useAuth } from '../application/AuthContext.jsx';
import { PageShell } from '../../../shared/components/PageShell.jsx';

/**
 * Consumes the link from the verification email and opens the session.
 */
export function VerifyEmailScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startSession } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [error, setError] = useState(null);
  const started = useRef(false);

  const token = searchParams.get('token');

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;

    if (!token) {
      setStatus('error');
      setError('El enlace no trae el código de verificación. Pedí uno nuevo desde el ingreso.');
      return;
    }

    verifyEmailRequest(token)
      .then((session) => {
        startSession(session);
        setStatus('verified');
        navigate(session.user?.role === 'SENIOR' ? '/senior' : '/caregiver', { replace: true });
      })
      .catch((caught) => {
        setError(caught.message);
        setStatus('error');
      });
  }, [token, startSession, navigate]);

  return (
    <PageShell eyebrow="Verificación" title="Verificando tu correo">
      <section className="card">
        {status === 'verifying' ? (
          <p className="muted" role="status" aria-live="polite">
            Un segundo, estamos activando tu cuenta…
          </p>
        ) : null}

        {status === 'verified' ? (
          <p className="alert alert--success" role="status">
            Cuenta verificada. Te estamos llevando al panel…
          </p>
        ) : null}

        {status === 'error' ? (
          <div>
            <p className="alert alert--error" role="alert">
              {error}
            </p>
            <p>
              <Link to="/login">Volver al ingreso</Link> y pedir un enlace nuevo.
            </p>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}
