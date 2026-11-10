/**
 * Barra de navegación superior del lobby post-login (artboard 02 "Pestañas superiores").
 *
 * Marca de producto a la izquierda, pestañas centrales y usuario + salir a la derecha.
 * Los enlaces son anclas a secciones de la misma página; el badge es opcional por enlace.
 */
export function AppTopbar({ brand = 'Acompaña', links = [], userInitial, onExit }) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <span className="topbar__brand">
          <span className="topbar__brand-mark" aria-hidden="true">❤</span>
          {brand}
        </span>

        {links.length > 0 ? (
          <nav className="topbar__nav" aria-label="Navegación principal">
            {links.map((link, index) => (
              <a
                key={link.href}
                className="topbar__link"
                href={link.href}
                aria-current={index === 0 ? 'page' : undefined}
              >
                {link.icon ? <span aria-hidden="true">{link.icon}</span> : null}
                {link.label}
                {link.badgeCount ? (
                  <span className="topbar__badge">{link.badgeCount}</span>
                ) : null}
              </a>
            ))}
          </nav>
        ) : null}

        <div className="topbar__user">
          {userInitial ? (
            <span className="topbar__avatar" aria-hidden="true">{userInitial}</span>
          ) : null}
          {onExit ? (
            <button type="button" className="topbar__exit" onClick={onExit}>
              Salir
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
