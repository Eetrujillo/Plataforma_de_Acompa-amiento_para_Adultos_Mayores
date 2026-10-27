import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../services/apiClient';
import {
  EMAIL_INVALID_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  PRIVACY_REQUIRED_MESSAGE,
  validateEmail,
  validatePassword,
} from '../../utils/validators';
import { FormField } from '../ui/FormField';
import { Notification } from '../ui/Notification';

interface RegisterFormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  privacy?: string;
  form?: string;
}

const EMAIL_EXISTS_MESSAGE = 'Este correo ya tiene una cuenta';

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterFormState>({ email: '', password: '' });
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [existingEmail, setExistingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    setForm((current) => ({ ...current, [name]: value }));

    if (name === 'email') {
      setErrors((current) => ({ ...current, email: undefined, form: undefined }));
      setExistingEmail(false);
    } else if (name === 'password') {
      setErrors((current) => ({ ...current, password: undefined, form: undefined }));
    }
  }

  function handlePrivacyChange(event: ChangeEvent<HTMLInputElement>) {
    setAcceptedPrivacy(event.target.checked);
    setErrors((current) => ({ ...current, privacy: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};

    if (!validateEmail(form.email)) {
      nextErrors.email = EMAIL_INVALID_MESSAGE;
    }

    const passwordError = validatePassword(form.password);
    if (passwordError) {
      nextErrors.password = passwordError;
    }

    if (!acceptedPrivacy) {
      nextErrors.privacy = PRIVACY_REQUIRED_MESSAGE;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setExistingEmail(false);
      return;
    }

    setErrors({});
    setExistingEmail(false);
    setSubmitting(true);

    try {
      await register({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        acceptPrivacyPolicy: true,
      });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_ALREADY_EXISTS') {
          setExistingEmail(true);
          return;
        }
        if (err.code === 'INVALID_EMAIL') {
          setErrors({ email: EMAIL_INVALID_MESSAGE });
          return;
        }
        if (err.code === 'WEAK_PASSWORD') {
          setErrors({ password: PASSWORD_RULE_MESSAGE });
          return;
        }
        if (err.code === 'PRIVACY_NOT_ACCEPTED') {
          setErrors({ privacy: PRIVACY_REQUIRED_MESSAGE });
          return;
        }
        setErrors({ form: err.message });
        return;
      }

      setErrors({
        form: err instanceof Error ? err.message : 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <p className="eyebrow">Crea tu cuenta</p>
      <h1>Registro de familiar</h1>
      <p className="auth-subtitle">
        Crea tu cuenta para acompañar y gestionar las actividades de tu familiar.
      </p>

      {existingEmail ? (
        <Notification type="error">
          {EMAIL_EXISTS_MESSAGE}{' '}
          <Link to="/login">Inicia sesión</Link>
        </Notification>
      ) : null}

      {errors.form ? <Notification type="error">{errors.form}</Notification> : null}

      <FormField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={handleChange}
        error={errors.email}
        required
      />
      <FormField
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_RULE_MESSAGE}
        value={form.password}
        onChange={handleChange}
        error={errors.password}
        required
      />

      <div className="checkbox-field">
        <label className="checkbox-label" htmlFor="acceptPrivacyPolicy">
          <input
            id="acceptPrivacyPolicy"
            name="acceptPrivacyPolicy"
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={handlePrivacyChange}
            required
            aria-invalid={errors.privacy ? true : undefined}
            aria-describedby={errors.privacy ? 'privacy-error' : undefined}
          />
          <span>Acepto la política de privacidad y el tratamiento de datos.</span>
        </label>

        <Link
          className="policy-link"
          to="/privacidad"
          target="_blank"
          rel="noopener noreferrer"
        >
          Leer la política (versión 1.0)
        </Link>

        {errors.privacy ? (
          <span id="privacy-error" className="form-error" role="alert">
            {errors.privacy}
          </span>
        ) : null}
      </div>

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>

      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
      </p>
    </form>
  );
}
