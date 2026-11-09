import { PageShell } from '../../../shared/components/PageShell.jsx';

/**
 * Pantalla del teléfono que todavía no está vinculado a ningún perfil.
 *
 * HU-006 (rework QR-only de L9): ya no se tipea ninguna credencial. El token viaja sólo dentro
 * del QR que el familiar muestra en su panel, y leerlo es trabajo del escáner de HU-007. Esta
 * pantalla no pide datos ni llama a la API: sólo explica qué falta.
 *
 * El nombre del componente y del archivo se conservan porque `pages/senior/SeniorHomePage.jsx`
 * los importa; HU-007 lo reemplaza por la vista de escaneo.
 */
export function PairingLinkForm() {
  return (
    <PageShell eyebrow="Primeros pasos" title="Vinculá este teléfono">
      <section className="card">
        <p className="card__hint">
          Pedile a tu familiar que abra su panel y genere el QR de tu perfil. Ese QR es la
          credencial: se usa una sola vez, vence a las 24 horas y no hay ningún número para
          escribir.
        </p>
        <p className="muted">
          El escaneo del QR todavía no está disponible en esta versión de la app.
        </p>
      </section>
    </PageShell>
  );
}
