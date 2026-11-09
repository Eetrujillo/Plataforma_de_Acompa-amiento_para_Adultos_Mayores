import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoginForm } from '../components/auth/LoginForm';

export function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="page-center">
        <p>Cargando…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to={user.emailVerified ? '/' : '/verificar-correo'} replace />;
  }

  return (
    <main className="auth-layout">
      <section className="auth-card auth-card--warm">
        <header className="auth-brand">
          <img className="auth-brand-logo" src="/icon.svg" alt="" width={44} height={44} />
          <span className="auth-brand-name">GAP · Acompañamiento para Adultos Mayores</span>
        </header>
        <figure className="auth-hero" aria-hidden="true">
          <img
            src="/abuelitos-abrazados.jpeg"
            alt=""
            width={260}
            height={190}
            loading="eager"
          />
          <figcaption className="auth-hero-caption">
            <strong>Jamás estás lejos</strong> de quien más querés.
          </figcaption>
        </figure>
        <LoginForm />
      </section>
    </main>
  );
}
