import type { ConsentText } from '../../types';

export function ConsentContent({ consent }: { consent: ConsentText }) {
  return (
    <div className="senior-consent">
      <p>{consent.intro}</p>

      <div className="senior-consent-items">
        {consent.items.map((item) => (
          <section className="senior-consent-item" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </section>
        ))}
      </div>

      <p className="senior-consent-closing">{consent.closing}</p>
      <p className="senior-consent-legal">{consent.legal}</p>
    </div>
  );
}
