import { Link } from 'react-router-dom';

export function PrivacyPolicyPage() {
  return (
    <main className="policy-page">
      <article className="policy-card">
        <p className="eyebrow">Información legal</p>
        <h1>Política de privacidad y tratamiento de datos</h1>
        <p className="policy-meta">Versión 1.0</p>

        <p>
          Esta política explica qué datos personales recopila la Plataforma de Acompañamiento
          para Adultos Mayores, para qué los usa y cómo puedes ejercer tus derechos.
        </p>

        <h2>Datos que recopilamos</h2>
        <ul>
          <li>Tu correo electrónico, usado como identificador de la cuenta.</li>
          <li>
            Tu contraseña, almacenada únicamente como un hash seguro; nunca se guarda en texto
            plano.
          </li>
          <li>
            La fecha y la versión de esta política que aceptaste al crear la cuenta.
          </li>
        </ul>

        <h2>Para qué usamos los datos</h2>
        <ul>
          <li>Crear y administrar tu cuenta de familiar.</li>
          <li>Permitirte gestionar las actividades y alertas de tu familiar.</li>
          <li>Mantener un registro del consentimiento otorgado para el tratamiento de datos.</li>
        </ul>

        <h2>Consentimiento</h2>
        <p>
          Al marcar la casilla de aceptación durante el registro, autorizas el tratamiento de tus
          datos para las finalidades descritas. Si no aceptas esta política, no es posible crear
          la cuenta.
        </p>

        <h2>Conservación y seguridad</h2>
        <p>
          Los datos se conservan mientras tu cuenta esté activa o durante el tiempo necesario para
          cumplir obligaciones legales. Aplicamos medidas técnicas para proteger la información,
          incluyendo el almacenamiento de contraseñas mediante hash.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Puedes solicitar el acceso, la actualización, la corrección o la eliminación de tus datos,
          así como revocar el consentimiento, contactando al administrador de la plataforma.
        </p>

        <p className="policy-note">
          Esta versión de la política debe ser revisada y aprobada por la institución responsable
          antes de su publicación definitiva.
        </p>

        <p className="auth-switch">
          <Link to="/register">Volver al registro</Link>
          {' · '}
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </article>
    </main>
  );
}
