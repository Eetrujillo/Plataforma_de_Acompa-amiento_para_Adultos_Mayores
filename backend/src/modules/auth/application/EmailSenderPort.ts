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

export interface EmailDeliveryResult {
  delivered: boolean;
  channel: 'smtp' | 'console';
}

export interface EmailSenderPort {
  sendVerificationEmail(message: VerificationEmailMessage): Promise<EmailDeliveryResult>;
}

/** Logger mínimo que consumen el caso de uso y el adaptador. */
export interface AuthLogger {
  info(message: string): void;
  warn(message: string): void;
}
