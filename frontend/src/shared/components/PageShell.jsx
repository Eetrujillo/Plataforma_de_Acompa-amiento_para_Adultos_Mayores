export function PageShell({ eyebrow, title, actions, children }) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          {eyebrow ? <p className="app-header__eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
        </div>
        {actions}
      </header>
      {children}
    </main>
  );
}
