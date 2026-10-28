const nodemailer = require('nodemailer');

let transporter;

function hasSmtpConfiguration() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (transporter) return transporter;

  if (!hasSmtpConfiguration()) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('El servicio de correo no está configurado.');
      error.code = 'EMAIL_NOT_CONFIGURED';
      throw error;
    }

    // En desarrollo no se envía un correo real: el enlace se imprime en consola.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  return transporter;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendVerificationEmail({ to, name, verificationUrl }) {
  const from = process.env.SMTP_FROM || 'Plataforma de Acompañamiento <no-reply@localhost>';
  const greeting = name ? `Hola, ${name}:` : 'Hola:';
  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(verificationUrl);

  const info = await getTransporter().sendMail({
    from,
    to,
    subject: 'Confirma tu correo electrónico',
    text: [
      greeting,
      '',
      'Gracias por registrarte en la Plataforma de Acompañamiento para Adultos Mayores.',
      'Confirma tu correo abriendo este enlace:',
      verificationUrl,
      '',
      'El enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1b2430; line-height: 1.6; max-width: 560px; margin: 0 auto;">
        <h1 style="color: #1f4e8c; font-size: 24px;">Confirma tu correo electrónico</h1>
        <p>${safeGreeting}</p>
        <p>
          Gracias por registrarte en la Plataforma de Acompañamiento para Adultos Mayores.
          Confirma que este correo es tuyo abriendo el siguiente enlace:
        </p>
        <p style="margin: 28px 0;">
          <a
            href="${safeUrl}"
            style="background: #1f4e8c; color: #ffffff; padding: 14px 22px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;"
          >
            Confirmar mi correo
          </a>
        </p>
        <p style="font-size: 14px; color: #566274;">
          El enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.
        </p>
        <p style="font-size: 13px; color: #566274; word-break: break-all;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
          ${safeUrl}
        </p>
      </div>
    `,
  });

  if (!hasSmtpConfiguration()) {
    console.log(`[desarrollo] Enlace de confirmación para ${to}: ${verificationUrl}`);
  }

  return info;
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const from = process.env.SMTP_FROM || 'Plataforma de Acompañamiento <no-reply@localhost>';
  const greeting = name ? `Hola, ${name}:` : 'Hola:';
  const safeGreeting = escapeHtml(greeting);
  const safeUrl = escapeHtml(resetUrl);

  const info = await getTransporter().sendMail({
    from,
    to,
    subject: 'Restablece tu contraseña',
    text: [
      greeting,
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta en la Plataforma de Acompañamiento para Adultos Mayores.',
      'Define una nueva contraseña abriendo este enlace:',
      resetUrl,
      '',
      'El enlace vence en 60 minutos y solo puede usarse una vez.',
      'Si no solicitaste este cambio, puedes ignorar este mensaje: tu contraseña no cambiará.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1b2430; line-height: 1.6; max-width: 560px; margin: 0 auto;">
        <h1 style="color: #1f4e8c; font-size: 24px;">Restablece tu contraseña</h1>
        <p>${safeGreeting}</p>
        <p>
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en la
          Plataforma de Acompañamiento para Adultos Mayores. Define una nueva contraseña
          abriendo el siguiente enlace:
        </p>
        <p style="margin: 28px 0;">
          <a
            href="${safeUrl}"
            style="background: #1f4e8c; color: #ffffff; padding: 14px 22px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;"
          >
            Definir nueva contraseña
          </a>
        </p>
        <p style="font-size: 14px; color: #566274;">
          El enlace vence en 60 minutos y solo puede usarse una vez. Si no solicitaste
          este cambio, puedes ignorar este mensaje: tu contraseña no cambiará.
        </p>
        <p style="font-size: 13px; color: #566274; word-break: break-all;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
          ${safeUrl}
        </p>
      </div>
    `,
  });

  if (!hasSmtpConfiguration()) {
    console.log(`[desarrollo] Enlace para restablecer contraseña de ${to}: ${resetUrl}`);
  }

  return info;
}

module.exports = { hasSmtpConfiguration, sendPasswordResetEmail, sendVerificationEmail };
