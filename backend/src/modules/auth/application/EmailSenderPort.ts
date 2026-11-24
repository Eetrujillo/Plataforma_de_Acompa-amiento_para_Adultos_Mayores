/**
 * Puerto de correo (skill email-adapter): el módulo auth nunca habla SMTP,
 * pide un envío y recibe un resultado. El copy lo arma el adaptador; el caso
 * de uso sólo aporta datos.
 */

export interface VerificationEmailMessage {
  /** Destinatario, ya normalizado. */
  to: string;
  /** Nombre para el saludo; el adaptador define el copy. */
  fullName: string;
  /** Enlace completo armado por el servidor con APP_URL (S5). */
  link: string;
  /** Horas de vigencia que el correo anuncia. */
  expiresInHours: number;
}

/**
 * Mensaje de restablecimiento (HU-004). Método propio del puerto — el nuevo
 * tipo de correo no reutiliza `sendVerificationEmail` (skill email-adapter
 * regla 5): el copy y el aviso de vencimiento viven en el adaptador.
 */
export interface PasswordResetEmailMessage {
  /** Destinatario, ya normalizado. */
  to: string;
  /** Nombre para el saludo; el adaptador define el copy. */
  fullName: string;
  /** Enlace completo armado por el servidor con APP_URL (D5). */
  link: string;
  /** Minutos de vigencia que el correo anuncia (default 60). */
  expiresInMinutes: number;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  channel: 'smtp' | 'console';
}

export interface EmailSenderPort {
  sendVerificationEmail(message: VerificationEmailMessage): Promise<EmailDeliveryResult>;
  sendPasswordResetEmail(message: PasswordResetEmailMessage): Promise<EmailDeliveryResult>;
}

/** Logger mínimo que consumen el caso de uso y el adaptador. */
export interface AuthLogger {
  info(message: string): void;
  warn(message: string): void;
}
