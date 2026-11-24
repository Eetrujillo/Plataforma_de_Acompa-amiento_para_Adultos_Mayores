import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type {
  AuthLogger,
  EmailDeliveryResult,
  EmailSenderPort,
  VerificationEmailMessage,
} from '../application/EmailSenderPort.ts';

/** Configuración SMTP resuelta por config/env.ts. Sin `host` el canal es `console`. */
export interface SmtpConfig {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

/**
 * Línea que la guía operativa espera en los logs del contenedor:
 * `docker compose logs backend | grep "email delivery"`.
 */
export function describeEmailChannel(config: SmtpConfig): string {
  return config.host === null || config.host === ''
    ? 'console'
    : `smtp (${config.host}:${config.port})`;
}

interface MessageBody {
  subject: string;
  text: string;
  html: string;
}

/** El copy vive acá, dentro del adaptador: el caso de uso sólo aporta datos (skill email-adapter). */
function buildMessage(message: VerificationEmailMessage): MessageBody {
  const greeting =
    message.fullName.trim() === '' ? 'Hola:' : `Hola ${message.fullName.trim()}:`;
  const subject = 'Confirmá tu correo electrónico';
  const text = [
    greeting,
    '',
    'Confirmá tu correo electrónico para activar tu cuenta:',
    '',
    message.link,
    '',
    `Este enlace vence en ${message.expiresInHours} horas y se puede usar una sola vez.`,
    'Si no fuiste vos quien creó la cuenta, ignorá este mensaje.',
    '',
    'Plataforma de Acompañamiento para Adultos Mayores',
  ].join('\n');
  const html = [
    '<p>',
    escapeHtml(greeting),
    '</p>',
    '<p>Confirmá tu correo electrónico para activar tu cuenta:</p>',
    '<p><a href="',
    message.link,
    '">Confirmar mi correo</a></p>',
    '<p>O copiá este enlace en tu navegador:<br>',
    escapeHtml(message.link),
    '</p>',
    '<p>Este enlace vence en ',
    String(message.expiresInHours),
    ' horas y se puede usar una sola vez. Si no fuiste vos quien creó la cuenta, ignorá este mensaje.</p>',
  ].join('');
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Opciones del transporte SMTP con timeouts explícitos (C5): un servidor que
 * acepta el TCP y nunca responde queda, con los defaults de nodemailer, hasta
 * dos minutos retomando la conexión — y ahí retiene el `201` del registro.
 * Exportadas para que el test las fije sin abrir ninguna conexión.
 */
export function smtpTransportOptions(config: SmtpConfig): SMTPTransport.Options {
  return {
    // El tipo de nodemailer no acepta null: sin host la cadena es `undefined`.
    host: config.host ?? undefined,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(config.user === null || config.user === ''
      ? {}
      : { auth: { user: config.user, pass: config.pass ?? '' } }),
  };
}

/**
 * Adaptador de correo (D4). Sin `SMTP_HOST` el canal es `console`: imprime el
 * enlace en el log del backend — excepción declarada de S6, es la única forma
 * de probar el flujo en desarrollo y en el arranque de la VPS — y el registro
 * sigue funcionando. Con SMTP, un envío caído no rompe la operación.
 */
export function createEmailSender(config: SmtpConfig, logger: AuthLogger): EmailSenderPort {
  if (config.host === null || config.host === '') {
    return {
      async sendVerificationEmail(message: VerificationEmailMessage): Promise<EmailDeliveryResult> {
        logger.info(
          `[email delivery: console] Enlace de verificación para ${message.to} ` +
            `(vence en ${message.expiresInHours} horas, de un solo uso): ${message.link}`,
        );
        return { delivered: true, channel: 'console' };
      },
    };
  }

  const transport = nodemailer.createTransport(smtpTransportOptions(config));

  return {
    async sendVerificationEmail(message: VerificationEmailMessage): Promise<EmailDeliveryResult> {
      try {
        const { subject, text, html } = buildMessage(message);
        await transport.sendMail({
          from: config.from,
          to: message.to,
          subject,
          text,
          html,
        });
        return { delivered: true, channel: 'smtp' };
      } catch (error: unknown) {
        // El mensaje del error de SMTP puede nombrar al destinatario, nunca al
        // token: el enlace no entra en este log (S6).
        logger.warn(
          `[email delivery: smtp] el envío falló; el token quedó emitido y puede pedirse de nuevo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { delivered: false, channel: 'smtp' };
      }
    },
  };
}
