/**
 * Hero de bienvenida del lobby del cuidador (artboard 02 "Pestañas superiores").
 *
 * Saludo + fecha y un resumen del día con datos reales: alertas SOS activas,
 * actividades de hoy y personas a cargo. `primaryHref` ancla a la sección de rutina.
 */
export function LobbyHero({ eyebrow, title, subtitle, stats = [], primaryLabel, primaryHref }) {
  return (
    <section className="lobby-hero" aria-labelledby="lobby-hero-title">
      <div>
        {eyebrow ? <p className="lobby-hero__eyebrow">{eyebrow}</p> : null}
        <h1 className="lobby-hero__title" id="lobby-hero-title">{title}</h1>
        {subtitle ? <p className="lobby-hero__sub">{subtitle}</p> : null}
      </div>

      {stats.length > 0 ? (
        <div className="lobby-hero__stats">
          {stats.map((stat) => (
            <div className="stat" key={stat.label}>
              <p className={`stat__value${stat.tone === 'alert' ? ' stat__value--alert' : ''}`}>
                {stat.value}
              </p>
              <p className="stat__label">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {primaryLabel && primaryHref ? (
        <a className="lobby-hero__cta" href={primaryHref}>
          {primaryLabel}
        </a>
      ) : null}
    </section>
  );
}
