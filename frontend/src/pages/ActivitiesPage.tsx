import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { SelectField } from '../components/ui/SelectField';
import { activityService } from '../services/activityService';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type {
  Activity,
  OlderAdult,
  OlderAdultRepeatType,
} from '../types';
import {
  ACTIVITY_ICONS,
  REPEAT_OPTIONS,
  WEEKDAYS,
  formatDateLabel,
  formatRepeatSummary,
  formatTimeLabel,
  getTodayDateKey,
} from '../utils/activity';
import { DEFAULT_TIME_ZONE, getTimeZoneLabel } from '../utils/timeZones';

type FormMode = 'create' | 'edit';
type FieldName =
  | 'olderAdultId'
  | 'title'
  | 'icon'
  | 'date'
  | 'time'
  | 'repeatType'
  | 'weekdays';
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormState {
  olderAdultId: string;
  title: string;
  icon: string;
  date: string;
  time: string;
  repeatType: OlderAdultRepeatType;
  weekdays: number[];
}

const TITLE_MAX_LENGTH = 60;

function emptyForm(olderAdult?: OlderAdult): FormState {
  const timeZone = olderAdult?.timeZone ?? DEFAULT_TIME_ZONE;

  return {
    olderAdultId: olderAdult?._id ?? '',
    title: '',
    icon: 'medicina',
    date: getTodayDateKey(timeZone),
    time: '09:00',
    repeatType: 'once',
    weekdays: [],
  };
}

export function ActivitiesPage() {
  const [searchParams] = useSearchParams();
  const [adults, setAdults] = useState<OlderAdult[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [success, setSuccess] = useState('');

  const [mode, setMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pastOpen, setPastOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedAdult = adults.find((adult) => adult._id === selectedId) ?? null;
  const selectedActivities = activities.filter(
    (activity) => !selectedId || activity.olderAdult === selectedId
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setListError('');

      try {
        const [adultsResponse, activitiesResponse] = await Promise.all([
          olderAdultService.list(),
          activityService.list(),
        ]);

        if (!active) return;

        setAdults(adultsResponse.olderAdults);
        setActivities(activitiesResponse.activities);

        // HU-020: al llegar desde el estado del dia, se abre el perfil pedido.
        const fromQuery = searchParams.get('olderAdultId');
        const preferred =
          adultsResponse.olderAdults.find((adult) => adult._id === fromQuery) ??
          adultsResponse.olderAdults.find((adult) => adult.linkStatus === 'linked') ??
          adultsResponse.olderAdults[0];

        if (preferred) {
          setSelectedId(preferred._id);
          setForm(emptyForm(preferred));
        }
      } catch (err) {
        if (!active) return;

        setListError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus actividades. Inténtalo de nuevo.'
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  function handleSelectedChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.target.value;
    const adult = adults.find((item) => item._id === nextId);

    setSelectedId(nextId);
    setMode(null);
    setEditingId(null);
    setForm(emptyForm(adult));
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(emptyForm(selectedAdult ?? undefined));
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startEdit(activity: Activity) {
    setMode('edit');
    setEditingId(activity._id);
    setForm({
      olderAdultId: activity.olderAdult,
      title: activity.title,
      icon: activity.icon,
      date: activity.date,
      time: activity.time,
      repeatType: activity.repeatType,
      weekdays: activity.weekdays,
    });
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function cancelForm() {
    setMode(null);
    setEditingId(null);
    setForm(emptyForm(selectedAdult ?? undefined));
    setFieldErrors({});
    setFormError('');
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;

    setForm((current) => ({ ...current, title: value }));
    setFieldErrors((current) => ({
      ...current,
      title:
        value.length > TITLE_MAX_LENGTH
          ? 'El título no puede superar los 60 caracteres.'
          : undefined,
    }));
    setFormError('');
  }

  function handleFieldChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const field = event.target.name as FieldName;
    const { value } = event.target;

    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  function toggleWeekday(value: number) {
    setForm((current) => {
      const has = current.weekdays.includes(value);
      return {
        ...current,
        weekdays: has
          ? current.weekdays.filter((day) => day !== value)
          : [...current.weekdays, value],
      };
    });
    setFieldErrors((current) => ({ ...current, weekdays: undefined }));
    setFormError('');
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    const title = form.title.trim();

    if (!form.olderAdultId) {
      nextErrors.olderAdultId = 'Selecciona a tu adulto mayor.';
    }

    if (!title) {
      nextErrors.title = 'Ingresa el título de la actividad.';
    } else if (title.length > TITLE_MAX_LENGTH) {
      nextErrors.title = 'El título no puede superar los 60 caracteres.';
    }

    if (!form.icon) {
      nextErrors.icon = 'Selecciona un ícono para la actividad.';
    }

    if (!form.date) {
      nextErrors.date = 'Selecciona la fecha de la actividad.';
    }

    if (!form.time) {
      nextErrors.time = 'Selecciona la hora de la actividad.';
    }

    if (form.repeatType === 'weekly' && form.weekdays.length === 0) {
      nextErrors.weekdays = 'Marca al menos un día de la semana.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function persist(confirmPast: boolean) {
    if (!validate()) return;

    const payload = {
      title: form.title.trim(),
      icon: form.icon,
      date: form.date,
      time: form.time,
      repeatType: form.repeatType,
      weekdays: form.repeatType === 'weekly' ? form.weekdays : [],
      confirmPast,
    };

    setSaving(true);
    setFormError('');
    setSuccess('');

    try {
      if (mode === 'edit' && editingId) {
        const response = await activityService.update(editingId, payload);
        setActivities((current) =>
          current.map((activity) =>
            activity._id === response.activity._id ? response.activity : activity
          )
        );
        setSuccess(
          'Actividad actualizada. Los días anteriores conservan sus datos y la app la verá en menos de 1 minuto.'
        );
      } else {
        const response = await activityService.create({
          olderAdultId: form.olderAdultId,
          ...payload,
        });
        setActivities((current) => [...current, response.activity]);
        setSuccess(
          'Actividad creada. Aparecerá en la app de tu adulto mayor en menos de 1 minuto.'
        );
      }

      setListError('');
      setMode(null);
      setEditingId(null);
      setForm(emptyForm(selectedAdult ?? undefined));
      setFieldErrors({});
      setPastOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACTIVITY_PAST_REQUIRES_CONFIRMATION') {
          setPastOpen(true);
        } else if (err.field && err.field in form) {
          setFieldErrors((current) => ({ ...current, [err.field as FieldName]: err.message }));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('No pudimos guardar la actividad. Inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setFormError('');

    try {
      await activityService.remove(deleteTarget._id);
      setActivities((current) =>
        current.filter((activity) => activity._id !== deleteTarget._id)
      );
      setSuccess(
        'Actividad eliminada. Dejará de aparecer y de generar recordatorios desde hoy; el historial anterior se conserva.'
      );
      setDeleteTarget(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos eliminar la actividad. Inténtalo de nuevo.'
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const timeZoneLabel = getTimeZoneLabel(selectedAdult?.timeZone ?? DEFAULT_TIME_ZONE);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Actividades</p>
          <h1>Actividades de mi adulto mayor</h1>
          <p className="muted">
            Crea la rutina diaria de tu adulto mayor. Solo puedes gestionar sus propias
            actividades.
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn-secondary" to="/">
            Volver al panel
          </Link>
          <Link className="btn-secondary" to="/adultos-mayores">
            Perfiles
          </Link>
          <Link
            className="btn-secondary"
            to={selectedId ? `/hoy?olderAdultId=${encodeURIComponent(selectedId)}` : '/hoy'}
          >
            Ver el día de hoy
          </Link>
          {mode === null && selectedAdult ? (
            <button className="btn-primary" type="button" onClick={startCreate}>
              Crear actividad
            </button>
          ) : null}
        </div>
      </header>

      {success ? <Notification type="success">{success}</Notification> : null}
      {listError ? <Notification type="error">{listError}</Notification> : null}
      {formError && mode === null ? <Notification type="error">{formError}</Notification> : null}

      {loading ? (
        <section className="card">
          <p className="muted adult-list-message">Cargando actividades…</p>
        </section>
      ) : adults.length === 0 ? (
        <section className="card">
          <h2>Aún no tienes un adulto mayor registrado</h2>
          <p className="muted">
            Primero registra el perfil de tu adulto mayor para poder crear sus actividades.
          </p>
          <p className="dashboard-section-action">
            <Link className="btn-primary" to="/adultos-mayores">
              Registrar adulto mayor
            </Link>
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="activity-toolbar">
              <SelectField
                label="Adulto mayor"
                name="olderAdult"
                value={selectedId}
                onChange={handleSelectedChange}
                hint={
                  selectedAdult
                    ? `Hora y zona horaria: ${timeZoneLabel}`
                    : 'Selecciona un adulto mayor.'
                }
                options={adults.map((adult) => ({
                  value: adult._id,
                  label: `${adult.name}${
                    adult.linkStatus === 'linked' ? '' : ' (pendiente de vincular)'
                  }`,
                }))}
              />
            </div>

            {selectedAdult && selectedAdult.linkStatus !== 'linked' ? (
              <Notification type="info">
                Este adulto mayor aún no ha vinculado su app. Las actividades quedarán
                listas y aparecerán cuando vincule su celular.
              </Notification>
            ) : null}
          </section>

          {mode !== null ? (
            <section className="card">
              <h2>{mode === 'create' ? 'Crear actividad' : 'Editar actividad'}</h2>
              <p className="muted">
                La hora se entiende en la zona horaria de tu adulto mayor:{' '}
                <strong>{timeZoneLabel}</strong>.
              </p>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                {formError ? <Notification type="error">{formError}</Notification> : null}

                <FormField
                  label="Título"
                  name="title"
                  value={form.title}
                  onChange={handleTitleChange}
                  error={fieldErrors.title}
                  hint={`${form.title.length}/${TITLE_MAX_LENGTH} caracteres. Máximo 60.`}
                  required
                />

                <fieldset className="activity-fieldset">
                  <legend>Ícono</legend>
                  <div className="activity-icon-options">
                    {ACTIVITY_ICONS.map((icon) => (
                      <label
                        className={`activity-icon-option${
                          form.icon === icon.key ? ' activity-icon-option-selected' : ''
                        }`}
                        key={icon.key}
                      >
                        <input
                          type="radio"
                          name="icon"
                          value={icon.key}
                          checked={form.icon === icon.key}
                          onChange={handleFieldChange}
                        />
                        <span className="activity-icon-emoji" aria-hidden="true">
                          {icon.emoji}
                        </span>
                        <span>{icon.label}</span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.icon ? (
                    <span className="form-error" role="alert">
                      {fieldErrors.icon}
                    </span>
                  ) : null}
                </fieldset>

                <div className="activity-datetime">
                  <FormField
                    label="Fecha"
                    name="date"
                    type="date"
                    value={form.date}
                    onChange={handleFieldChange}
                    error={fieldErrors.date}
                    required
                  />
                  <FormField
                    label="Hora"
                    name="time"
                    type="time"
                    value={form.time}
                    onChange={handleFieldChange}
                    error={fieldErrors.time}
                    hint={`Hora de ${timeZoneLabel}.`}
                    required
                  />
                </div>

                <SelectField
                  label="Repetición"
                  name="repeatType"
                  value={form.repeatType}
                  onChange={handleFieldChange}
                  options={REPEAT_OPTIONS}
                  required
                />

                {form.repeatType === 'weekly' ? (
                  <fieldset className="activity-fieldset">
                    <legend>Días de la semana</legend>
                    <div className="activity-weekdays">
                      {WEEKDAYS.map((day) => (
                        <label
                          className={`activity-weekday${
                            form.weekdays.includes(day.value)
                              ? ' activity-weekday-selected'
                              : ''
                          }`}
                          key={day.value}
                        >
                          <input
                            type="checkbox"
                            checked={form.weekdays.includes(day.value)}
                            onChange={() => toggleWeekday(day.value)}
                          />
                          <span>{day.label}</span>
                        </label>
                      ))}
                    </div>
                    {fieldErrors.weekdays ? (
                      <span className="form-error" role="alert">
                        {fieldErrors.weekdays}
                      </span>
                    ) : null}
                  </fieldset>
                ) : null}

                <p className="activity-repeat-preview">
                  Repetición: <strong>{formatRepeatSummary(form.repeatType, form.weekdays)}</strong>
                </p>

                <div className="activity-form-actions">
                  <button className="btn-primary" type="submit" disabled={saving}>
                    {saving
                      ? 'Guardando…'
                      : mode === 'create'
                        ? 'Crear actividad'
                        : 'Guardar cambios'}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={cancelForm}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="card">
            <h2>Actividades registradas</h2>
            <p className="muted">
              La app del adulto mayor se actualiza automáticamente en menos de 1 minuto.
            </p>

            {selectedActivities.length === 0 ? (
              <p className="muted adult-list-message">
                Este adulto mayor todavía no tiene actividades.
              </p>
            ) : (
              <div className="activity-list">
                {selectedActivities.map((activity) => (
                  <article className="activity-card" key={activity._id}>
                    <span className="activity-icon" aria-hidden="true">
                      {activity.iconEmoji}
                    </span>
                    <div className="activity-body">
                      <h3>{activity.title}</h3>
                      <p className="muted">
                        {activity.repeatType === 'once'
                          ? formatDateLabel(activity.date)
                          : `Desde el ${formatDateLabel(activity.date)}`}{' '}
                        · {formatTimeLabel(activity.time)}
                      </p>
                      <p className="muted">
                        Repetición: {activity.repeatSummary}
                      </p>
                      <p className="muted activity-timezone">
                        Zona horaria: {getTimeZoneLabel(activity.timeZone)}
                      </p>
                    </div>
                    <div className="activity-actions">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => startEdit(activity)}
                        aria-label={`Editar ${activity.title}`}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => setDeleteTarget(activity)}
                        aria-label={`Eliminar ${activity.title}`}
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={pastOpen}
        title="La fecha y hora ya pasaron"
        description="La fecha y hora que elegiste ya pasaron. ¿Deseas guardar la actividad de todos modos o prefieres corregir los datos?"
        confirmLabel="Sí, guardar"
        cancelLabel="Corregir datos"
        busy={saving}
        onConfirm={() => {
          setPastOpen(false);
          void persist(true);
        }}
        onCancel={() => setPastOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar actividad"
        description={
          deleteTarget
            ? `La actividad "${deleteTarget.title}" dejará de aparecer y de generar recordatorios desde hoy. El historial de los días anteriores se conserva. ¿Deseas eliminarla?`
            : ''
        }
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
