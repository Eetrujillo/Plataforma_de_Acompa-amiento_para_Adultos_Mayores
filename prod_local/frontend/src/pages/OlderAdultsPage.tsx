import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { SelectField } from '../components/ui/SelectField';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type { OlderAdult, OlderAdultLinkingCode } from '../types';
import {
  DEFAULT_TIME_ZONE,
  getTimeZoneLabel,
  getTimeZoneOptions,
} from '../utils/timeZones';

type FormMode = 'create' | 'edit';
type FormFieldName = 'name' | 'pin' | 'timeZone';
type FieldErrors = Partial<Record<FormFieldName, string>>;

interface FormState {
  name: string;
  pin: string;
  timeZone: string;
}

interface LinkingCodeView {
  olderAdultId: string;
  olderAdultName: string;
  timeZone: string;
  code: OlderAdultLinkingCode;
}

interface CopyStatus {
  type: 'success' | 'error';
  message: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  pin: '',
  timeZone: DEFAULT_TIME_ZONE,
};

const PIN_REGEX = /^\d{4}$/;
const NAME_REQUIRED_MESSAGE = 'Ingresa el nombre de tu adulto mayor.';
const PIN_REQUIRED_MESSAGE = 'Ingresa el PIN de tu adulto mayor.';
const PIN_INVALID_MESSAGE = 'El PIN debe tener exactamente 4 números.';
const TIME_ZONE_INVALID_MESSAGE = 'Selecciona una zona horaria válida.';

function linkStatusLabel(status: OlderAdult['linkStatus']) {
  return status === 'pending' ? 'Pendiente de vincular' : 'Vinculado';
}

function formatExpiration(expiresAt: string, timeZone: string) {
  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) return expiresAt;

  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleString('es-CO');
  }
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('No se pudo copiar el código.');
  }
}

export function OlderAdultsPage() {
  const [olderAdults, setOlderAdults] = useState<OlderAdult[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [linkingCode, setLinkingCode] = useState<LinkingCodeView | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<OlderAdult | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadOlderAdults() {
      setLoading(true);
      setListError('');

      try {
        const response = await olderAdultService.list();
        if (active) {
          setOlderAdults(response.olderAdults);
        }
      } catch (err) {
        if (!active) return;

        setListError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus adultos mayores. Inténtalo de nuevo.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOlderAdults();

    return () => {
      active = false;
    };
  }, []);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startEdit(olderAdult: OlderAdult) {
    setMode('edit');
    setEditingId(olderAdult._id);
    setForm({
      name: olderAdult.name,
      pin: '',
      timeZone: olderAdult.timeZone,
    });
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function cancelForm() {
    setMode(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  }

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const field = event.target.name as FormFieldName;
    const { value } = event.target;

    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};
    const name = form.name.trim();
    const pin = form.pin.trim();

    if (!name) {
      nextErrors.name = NAME_REQUIRED_MESSAGE;
    } else if (name.length < 2) {
      nextErrors.name = 'El nombre debe tener al menos 2 caracteres.';
    } else if (name.length > 80) {
      nextErrors.name = 'El nombre no puede superar los 80 caracteres.';
    }

    if (mode === 'create' && !pin) {
      nextErrors.pin = PIN_REQUIRED_MESSAGE;
    } else if (pin && !PIN_REGEX.test(pin)) {
      nextErrors.pin = PIN_INVALID_MESSAGE;
    }

    if (!form.timeZone.trim()) {
      nextErrors.timeZone = TIME_ZONE_INVALID_MESSAGE;
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!mode || !validateForm()) return;

    const name = form.name.trim();
    const pin = form.pin.trim();
    const timeZone = form.timeZone;

    setSubmitting(true);
    setFormError('');
    setSuccess('');

    try {
      if (mode === 'create') {
        const response = await olderAdultService.create({ name, pin, timeZone });
        setOlderAdults((current) => [response.olderAdult, ...current]);
        setSuccess(response.message ?? 'Perfil creado. Queda pendiente de vincular.');
      } else {
        if (!editingId) return;

        const payload = pin ? { name, pin, timeZone } : { name, timeZone };
        const response = await olderAdultService.update(editingId, payload);
        setOlderAdults((current) =>
          current.map((olderAdult) =>
            olderAdult._id === response.olderAdult._id ? response.olderAdult : olderAdult
          )
        );
        setSuccess(response.message ?? 'Perfil actualizado.');
      }

      setListError('');
      setMode(null);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setFieldErrors({});
    } catch (err) {
      if (err instanceof ApiError) {
        const field = err.field;

        if (field === 'name' || field === 'pin' || field === 'timeZone') {
          setFieldErrors((current) => ({ ...current, [field]: err.message }));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('No pudimos guardar el perfil. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateLinkingCode(olderAdult: OlderAdult) {
    if (olderAdult.linkStatus === 'linked' || generatingId) return;

    setGeneratingId(olderAdult._id);
    setLinkError('');
    setCopyStatus(null);
    setSuccess('');

    try {
      const response = await olderAdultService.generateLinkingCode(olderAdult._id);
      setOlderAdults((current) =>
        current.map((item) =>
          item._id === response.olderAdult._id ? response.olderAdult : item
        )
      );
      setLinkingCode({
        olderAdultId: response.olderAdult._id,
        olderAdultName: response.olderAdult.name,
        timeZone: response.olderAdult.timeZone,
        code: response.linkingCode,
      });
      setSuccess(response.message ?? 'Código de vinculación generado.');
    } catch (err) {
      if (err instanceof ApiError) {
        setLinkError(err.message);

        if (err.code === 'OLDER_ADULT_ALREADY_LINKED') {
          setOlderAdults((current) =>
            current.map((item) =>
              item._id === olderAdult._id ? { ...item, linkStatus: 'linked' } : item
            )
          );
          setLinkingCode((current) =>
            current?.olderAdultId === olderAdult._id ? null : current
          );
        }
      } else {
        setLinkError('No pudimos generar el código. Inténtalo de nuevo.');
      }
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleCopyCode() {
    if (!linkingCode) return;

    try {
      await copyTextToClipboard(linkingCode.code.code);
      setCopyStatus({
        type: 'success',
        message: 'Código copiado. Puedes enviarlo por otro medio.',
      });
    } catch {
      setCopyStatus({
        type: 'error',
        message: 'No pudimos copiar el código. Selecciónalo y cópialo manualmente.',
      });
    }
  }

  async function handleUnlink() {
    if (!unlinkTarget || unlinking) return;

    setUnlinking(true);
    setUnlinkError('');
    setSuccess('');

    try {
      const response = await olderAdultService.unlink(unlinkTarget._id);

      setOlderAdults((current) =>
        current.map((item) =>
          item._id === response.olderAdult._id ? response.olderAdult : item
        )
      );
      setLinkingCode((current) =>
        current?.olderAdultId === unlinkTarget._id ? null : current
      );
      setCopyStatus(null);
      setSuccess(
        response.message ??
          'Adulto mayor desvinculado. Su app dejará de mostrar actividades y alertas.'
      );
      setUnlinkTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OLDER_ADULT_NOT_LINKED') {
        setOlderAdults((current) =>
          current.map((item) =>
            item._id === unlinkTarget._id ? { ...item, linkStatus: 'pending' } : item
          )
        );
        setLinkingCode((current) =>
          current?.olderAdultId === unlinkTarget._id ? null : current
        );
      }

      setUnlinkError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos desvincular al adulto mayor. Inténtalo de nuevo.'
      );
      setUnlinkTarget(null);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Adultos mayores</p>
          <h1>Mis adultos mayores</h1>
          <p className="muted">
            Registra y actualiza los perfiles que acompañarás desde tu cuenta.
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn-secondary" to="/">
            Volver al panel
          </Link>
          {mode === null ? (
            <button
              className="btn-primary"
              type="button"
              onClick={startCreate}
              disabled={loading}
            >
              Registrar adulto mayor
            </button>
          ) : null}
        </div>
      </header>

      {success ? <Notification type="success">{success}</Notification> : null}
      {linkError && mode === null ? <Notification type="error">{linkError}</Notification> : null}
      {unlinkError && mode === null ? (
        <Notification type="error">{unlinkError}</Notification>
      ) : null}
      {listError && mode === null ? <Notification type="error">{listError}</Notification> : null}

      {mode !== null ? (
        <section className="card">
          <h2>{mode === 'create' ? 'Registrar adulto mayor' : 'Editar perfil'}</h2>
          <p className="muted">
            {mode === 'create'
              ? 'El perfil quedará pendiente de vincular a la app de tu adulto mayor.'
              : 'Puedes cambiar el nombre, la zona horaria o el PIN.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {formError ? <Notification type="error">{formError}</Notification> : null}

            <FormField
              label="Nombre"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={fieldErrors.name}
              hint="Nombre de tu adulto mayor."
              autoComplete="name"
              maxLength={80}
              required
            />

            <FormField
              label="PIN"
              name="pin"
              type="password"
              inputMode="numeric"
              value={form.pin}
              onChange={handleChange}
              error={fieldErrors.pin}
              hint={
                mode === 'create'
                  ? 'Exactamente 4 números.'
                  : 'Déjalo vacío para conservar el PIN actual.'
              }
              autoComplete="new-password"
              required={mode === 'create'}
            />

            <SelectField
              label="Zona horaria"
              name="timeZone"
              value={form.timeZone}
              onChange={handleChange}
              error={fieldErrors.timeZone}
              hint="Si no eliges otra, se usa America/Bogota (Colombia)."
              options={getTimeZoneOptions(form.timeZone)}
              required
            />

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting
                ? 'Guardando…'
                : mode === 'create'
                  ? 'Crear perfil'
                  : 'Guardar cambios'}
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={cancelForm}
              disabled={submitting}
            >
              Cancelar
            </button>
          </form>
        </section>
      ) : (
        <section className="card">
          <h2>Perfiles registrados</h2>
          <p className="muted">Solo ves los perfiles creados desde tu cuenta.</p>

          {loading ? (
            <p className="muted adult-list-message">Cargando perfiles…</p>
          ) : listError ? null : olderAdults.length === 0 ? (
            <p className="muted adult-list-message">
              Aún no has registrado a tu adulto mayor.
            </p>
          ) : (
            <div className="adult-list">
              {olderAdults.map((olderAdult) => (
                <article className="adult-card" key={olderAdult._id}>
                  <div>
                    <h2>{olderAdult.name}</h2>
                    <p className="muted">
                      Zona horaria: {getTimeZoneLabel(olderAdult.timeZone)}
                    </p>
                    <p className="muted">
                      PIN: {olderAdult.pinConfigured ? 'configurado' : 'sin configurar'}
                    </p>
                    <p className="muted">
                      Estado: <strong>{linkStatusLabel(olderAdult.linkStatus)}</strong>
                    </p>
                    {olderAdult.linkStatus === 'linked' ? (
                      <p className="muted">
                        Este adulto mayor ya está vinculado; no es necesario generar un código.
                      </p>
                    ) : null}
                  </div>
                  <div className="adult-card-actions">
                    {olderAdult.linkStatus === 'pending' ? (
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() => void handleGenerateLinkingCode(olderAdult)}
                        disabled={generatingId !== null}
                        aria-label={`Generar código de vinculación para ${olderAdult.name}`}
                      >
                        {generatingId === olderAdult._id
                          ? 'Generando…'
                          : 'Generar código de vinculación'}
                      </button>
                    ) : null}
                    {olderAdult.linkStatus === 'linked' ? (
                      <button
                        className="btn-danger"
                        type="button"
                        onClick={() => {
                          setUnlinkError('');
                          setSuccess('');
                          setUnlinkTarget(olderAdult);
                        }}
                        aria-label={`Desvincular a ${olderAdult.name}`}
                      >
                        Desvincular
                      </button>
                    ) : null}
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => startEdit(olderAdult)}
                      aria-label={`Editar perfil de ${olderAdult.name}`}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {mode === null && linkingCode ? (
        <section className="card linking-code-card" aria-labelledby="linking-code-title">
          <div className="linking-code-header">
            <div>
              <h2 id="linking-code-title">Código de vinculación</h2>
              <p className="muted">Para {linkingCode.olderAdultName}</p>
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setLinkingCode(null);
                setCopyStatus(null);
              }}
            >
              Cerrar
            </button>
          </div>

          <div className="linking-code-content">
            <div className="linking-code-details">
              <p className="muted">
                Compártelo solo con tu adulto mayor. Vence el{' '}
                <strong>
                  {formatExpiration(linkingCode.code.expiresAt, linkingCode.timeZone)}
                </strong>{' '}
                ({getTimeZoneLabel(linkingCode.timeZone)}) y sirve una sola vez.
              </p>

              <div className="linking-code-value">
                <code>{linkingCode.code.code}</code>
                <button className="btn-primary" type="button" onClick={() => void handleCopyCode()}>
                  Copiar código
                </button>
              </div>

              {copyStatus ? (
                <Notification type={copyStatus.type}>{copyStatus.message}</Notification>
              ) : null}

              <p className="muted linking-code-warning">
                Si generas un código nuevo, este dejará de funcionar. El QR contiene el mismo
                código para que tu adulto mayor lo escanee desde su app.
              </p>
            </div>

            <figure className="linking-code-qr">
              <img
                src={linkingCode.code.qrDataUrl}
                alt={`Código QR de vinculación para ${linkingCode.olderAdultName}`}
                width={220}
                height={220}
              />
              <figcaption>Escanea el QR desde la app del adulto mayor.</figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={unlinkTarget !== null}
        title="Desvincular a tu adulto mayor"
        description={
          unlinkTarget
            ? `La app de ${unlinkTarget.name} dejará de mostrar actividades y alertas, y tú dejarás de recibir sus datos. Su app le mostrará un aviso para vincularse de nuevo. El historial de actividades se conserva y podrás generar un código nuevo cuando quieras. ¿Deseas desvincularlo?`
            : ''
        }
        confirmLabel="Sí, desvincular"
        cancelLabel="Cancelar"
        danger
        busy={unlinking}
        onConfirm={() => void handleUnlink()}
        onCancel={() => setUnlinkTarget(null)}
      />
    </main>
  );
}
