import { useCallback, useEffect, useState } from 'react';

import { createSeniorProfile, listSeniorProfiles } from '../../application/seniorsApi.js';
import { FormField } from '../../../../shared/components/FormField.jsx';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton.jsx';

/**
 * The zone decides when a routine is due, so the list is explicit instead of free text:
 * a typo in a hand written zone would move every schedule of that senior.
 */
const TIME_ZONES = [
  { value: 'America/Bogota', label: 'Bogotá (Colombia)' },
  { value: 'America/Lima', label: 'Lima (Perú)' },
  { value: 'America/Guayaquil', label: 'Quito (Ecuador)' },
  { value: 'America/Caracas', label: 'Caracas (Venezuela)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (México)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (Argentina)' },
  { value: 'America/Santiago', label: 'Santiago (Chile)' }
];

const LINK_STATUS_LABELS = {
  PENDING: 'Pendiente de vinculación',
  LINKED: 'Vinculado'
};

const EMPTY_FORM = { fullName: '', pin: '', timezone: TIME_ZONES[0].value };

export function SeniorProfilePanel() {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createdName, setCreatedName] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await listSeniorProfiles());
      setError(null);
    } catch (caught) {
      setError(caught.message);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setCreatedName(null);

    try {
      const created = await createSeniorProfile(form);
      setForm({ ...EMPTY_FORM, timezone: form.timezone });
      setCreatedName(created.fullName);
      await loadProfiles();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Mi adulto mayor</h2>
      <p className="card__hint">
        Cargá el perfil con el nombre con el que lo llamás, un PIN de 4 dígitos que solo él
        conoce y la zona horaria de su casa. El perfil queda pendiente hasta que vincules su
        teléfono.
      </p>

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}

      {createdName ? (
        <p className="alert alert--success" role="status">
          Guardamos el perfil de {createdName}. Todavía falta vincular su teléfono.
        </p>
      ) : null}

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <FormField
          id="seniorFullName"
          label="Nombre del adulto mayor"
          hint="Como le decís vos, no el nombre completo del documento."
          value={form.fullName}
          onChange={(event) => updateField('fullName', event.target.value)}
          autoComplete="name"
          required
        />

        <FormField
          id="seniorPin"
          label="PIN de 4 dígitos"
          hint="Se guarda cifrado y no se puede consultar después."
          value={form.pin}
          onChange={(event) => updateField('pin', event.target.value.replace(/\D/g, '').slice(0, 4))}
          // `text` con `inputMode` numérico: un `type="number"` aceptaría "e" y "-", y suma
          // flechas que un teclado táctil no necesita.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          required
        />

        <div className="field">
          <label className="field__label" htmlFor="seniorTimezone">
            Zona horaria
          </label>
          <select
            className="field__input"
            id="seniorTimezone"
            name="seniorTimezone"
            value={form.timezone}
            onChange={(event) => updateField('timezone', event.target.value)}
          >
            {TIME_ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>

        <PrimaryButton type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar perfil'}
        </PrimaryButton>
      </form>

      <h3 className="card__title">Perfiles a tu cargo</h3>

      {profiles.length === 0 ? (
        <p className="muted">Todavía no cargaste ningún perfil.</p>
      ) : (
        <ul className="stack">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <strong>{profile.fullName}</strong>{' '}
              <span
                className={`badge ${
                  profile.linkStatus === 'LINKED' ? 'badge--completed' : 'badge--pending'
                }`}
              >
                {LINK_STATUS_LABELS[profile.linkStatus] ?? profile.linkStatus}
              </span>
              <p className="muted">{profile.timezone}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
