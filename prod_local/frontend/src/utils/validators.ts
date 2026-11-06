export const EMAIL_INVALID_MESSAGE = 'Escribe un correo válido';
export const PASSWORD_RULE_MESSAGE =
  'La contraseña debe tener mínimo 8 caracteres, con letras y números.';
export const PRIVACY_REQUIRED_MESSAGE =
  'Debes aceptar la política de privacidad y el tratamiento de datos.';

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePassword(password: string): string | null {
  if (!/^(?=.*\p{L})(?=.*\d).{8,}$/u.test(password)) {
    return PASSWORD_RULE_MESSAGE;
  }
  return null;
}
