/**
 * Contenedor común de pantallas. Comportamiento por defecto intacto para las
 * pantallas de autenticación; el lobby del cuidador usa `topbar` (navbar sticky)
 * y `hero` (que reemplaza el header clásico por el hero de bienvenida).
 */
export function PageShell({ eyebrow, title, actions, topbar, hero, children }) {
  return (
    <>
      {topbar}
      <main className={hero ? 'app-shell app-shell--lobby' : 'app-shell'}>
        {hero ?? (
          <header className="app-header">
            <div>
              {eyebrow ? <p className="app-header__eyebrow">{eyebrow}</p> : null}
              <h1>{title}</h1>
            </div>
            {actions}
          </header>
        )}
        {children}
      </main>
    </>
  );
}
