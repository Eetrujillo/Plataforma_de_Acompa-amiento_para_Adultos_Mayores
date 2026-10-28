import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import { EMAIL_INVALID_MESSAGE, validateEmail } from '../utils/validators';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!validateEmail(email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const response = await authService.requestPasswordReset(email.trim().toLowerCase());
      setMessage(response.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos enviar la solicitud. Inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">Recuperar contraseña</p>
        <h1>Recuperar mi contraseña</h1>
        <p className="auth-subtitle">
          Escribe el correo de tu cuenta y te enviaremos un enlace para definir una nueva
          contraseña.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Notification type="error">{error}</Notification>
          <Notification type="success">{message}</Notification>

          <FormField
            label="Correo electrónico"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={handleChange}
            required
          />

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">Volver a iniciar sesión</Link>
        </p>
      </section>
    </main>
  );
}
