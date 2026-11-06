import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  requireVerified?: boolean;
}

export function ProtectedRoute({ requireVerified = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="page-center">
        <p>Cargando sesión…</p>
      </main>
    );
  }

  const requestedPath = `${location.pathname}${location.search}`;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: requestedPath }} />;
  }

  if (requireVerified && !user.emailVerified) {
    return <Navigate to="/verificar-correo" replace state={{ from: requestedPath }} />;
  }

  return <Outlet />;
}
