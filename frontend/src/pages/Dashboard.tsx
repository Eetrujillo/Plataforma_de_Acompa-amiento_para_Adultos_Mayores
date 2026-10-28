import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Notification } from '../components/ui/Notification';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  teacher: 'Docente',
  student: 'Estudiante',
  familiar: 'Familiar',
};

export function Dashboard() {
  const { user, logout, welcomePending, consumeWelcome, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (welcomePending) {
      setShowWelcome(true);
      consumeWelcome();
    }
  }, [welcomePending, consumeWelcome]);

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

  return (
    <main className="dashboard">
      {showWelcome ? (
        <Notification type="success">
          ¡Bienvenido/a, {user.name}! Tu cuenta de familiar fue creada correctamente.
        </Notification>
      ) : null}

      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Sesión iniciada</p>
          <h1>Hola, {user.name}</h1>
          <p className="muted">Tu cuenta de familiar está conectada a la base de datos.</p>
        </div>
        <button className="btn-secondary" type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>

      <section className="card">
        <h2>Datos de la cuenta</h2>
        <dl className="data-list">
          <div>
            <dt>Nombre</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Correo confirmado</dt>
            <dd>{user.emailVerified ? 'Sí' : 'No'}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
          </div>
          {user.privacyPolicy ? (
            <div>
              <dt>Política de privacidad</dt>
              <dd>
                Versión {user.privacyPolicy.version} · aceptada el{' '}
                {new Date(user.privacyPolicy.acceptedAt).toLocaleDateString('es')}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="card dashboard-section">
        <h2>Mis adultos mayores</h2>
        <p className="muted">
          Registra el perfil de tu adulto mayor con su nombre, PIN y zona horaria.
        </p>
        <p className="dashboard-section-action">
          <Link className="btn-primary" to="/adultos-mayores">
            Gestionar perfiles
          </Link>
        </p>
      </section>

      <section className="card dashboard-section">
        <h2>Actividades y rutina</h2>
        <p className="muted">
          Crea actividades una sola vez, todos los días o en los días que elijas. Tu
          adulto mayor las verá en su app.
        </p>
        <p className="dashboard-section-action">
          <Link className="btn-primary" to="/actividades">
            Gestionar actividades
          </Link>
        </p>
      </section>

      <section className="card dashboard-section">
        <h2>App del adulto mayor</h2>
        <p className="muted">
          Si tu adulto mayor va a vincular su celular, puede abrir la app y escribir o
          escanear el código que le compartas.
        </p>
        <p className="dashboard-section-action">
          <Link className="btn-secondary" to="/app/vincular">
            Abrir la app del adulto mayor
          </Link>
        </p>
      </section>
    </main>
  );
}
