'use strict';

const nodemailer = require('nodemailer');

function buildMessage({ fullName, link, expiresInHours }) {
  const text = [
    `Hola ${fullName},`,
    '',
    'Para activar tu cuenta en la Plataforma de Acompañamiento abrí este enlace:',
    link,
    '',
    `El enlace vence en ${expiresInHours} horas y se puede usar una sola vez.`,
    'Si no creaste esta cuenta, ignorá este mensaje.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:18px;line-height:1.5;color:#10202b">
      <p>Hola ${fullName},</p>
      <p>Para activar tu cuenta en la Plataforma de Acompañamiento tocá el botón:</p>
      <p>
        <a href="${link}"
           style="display:inline-block;padding:14px 24px;background:#0f3d5c;color:#fff;border-radius:12px;text-decoration:none;font-weight:bold">
          Verificar mi correo
        </a>
      </p>
      <p style="font-size:15px;color:#3d5262">
        El enlace vence en ${expiresInHours} horas y se puede usar una sola vez.
      </p>
      <p style="font-size:15px;color:#3d5262">Si no creaste esta cuenta, ignorá este mensaje.</p>
    </div>
  `;

  return { subject: 'Verificá tu correo · Plataforma de Acompañamiento', text, html };
}

/**
 * Email adapter.
 *
 * With SMTP configured it delivers through nodemailer; without it, the link is
 * printed to the console so development and the VPS bootstrap keep working.
 */
function createEmailSender({ smtp, logger = console }) {
  if (!smtp.host) {
    return {
      channel: 'console',
      async sendVerificationEmail(payload) {
        logger.info(
          `[email] SMTP no configurado. Enlace de verificación para ${payload.to}: ${payload.link}`
        );
        return { delivered: false, channel: 'console' };
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {})
  });

  return {
    channel: 'smtp',
    async sendVerificationEmail(payload) {
      await transporter.sendMail({
        from: smtp.from,
        to: payload.to,
        ...buildMessage(payload)
      });

      return { delivered: true, channel: 'smtp' };
    }
  };
}

module.exports = { createEmailSender };
