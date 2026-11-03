import { useState } from 'react';

import { createActivity } from '../../infrastructure/activitiesHttpAdapter.js';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton.jsx';
import { FormField } from '../../../../shared/components/FormField.jsx';
import { todayIsoDate } from '../../../../shared/utils/date.js';

const EMPTY_FORM = { title: '', description: '', scheduledTime: '09:00', scheduledDate: todayIsoDate() };

export function ActivityComposer({ seniorId, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const activity = await createActivity({ seniorId, ...form });
      setSuccess(`Actividad "${activity.title}" agregada.`);
      setForm({ ...EMPTY_FORM, scheduledDate: form.scheduledDate });
      onCreated?.(activity);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Nueva actividad</h2>
      <p className="card__hint">Sumá un hábito a la rutina diaria del adulto mayor.</p>

      {error ? (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="alert alert--success" role="status">
          {success}
        </p>
      ) : null}

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <FormField
          id="title"
          label="Actividad"
          hint="Por ejemplo: tomar la medicación"
          required
          value={form.title}
          onChange={handleChange}
        />

        <FormField
          id="description"
          label="Detalle (opcional)"
          value={form.description}
          onChange={handleChange}
        />

        <FormField
          id="scheduledTime"
          label="Hora"
          type="time"
          required
          value={form.scheduledTime}
          onChange={handleChange}
        />

        <FormField
          id="scheduledDate"
          label="Día"
          type="date"
          required
          value={form.scheduledDate}
          onChange={handleChange}
        />

        <PrimaryButton type="submit" disabled={pending || !seniorId}>
          {pending ? 'Guardando…' : 'Agregar actividad'}
        </PrimaryButton>
      </form>
    </section>
  );
}
