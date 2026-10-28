import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { RegisterForm } from '../components/auth/RegisterForm';

export function RegisterPage() {
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
      <section className="auth-card">
        <RegisterForm />
      </section>
    </main>
  );
}
