# 🛠️ Skill: Adaptador de Correo (Email Adapter)

## Contrato del Puerto
El módulo `auth` nunca habla SMTP: pide un envío y recibe un resultado.

```text
emailSender.sendVerificationEmail({ to, fullName, link, expiresInHours })
  -> { delivered: boolean, channel: 'smtp' | 'console' }
```

## Implementación Actual
- Archivo: `backend/src/modules/auth/infrastructure/EmailSender.js` (`createEmailSender({ smtp, logger })`).
- **Con SMTP configurado:** `nodemailer` entrega por `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`.
- **Sin `SMTP_HOST`:** canal `console`. No falla: imprime el enlace en el log del backend para que el registro siga funcionando en desarrollo y en el arranque de la VPS.
- El asunto y los textos viven en `buildMessage()`, dentro del adaptador: el caso de uso solo aporta datos, nunca copy.

## Reglas Obligatorias
1. **Un envío caído no rompe la operación.** `application/issueVerificationEmail.js` envuelve el envío en `try/catch` y devuelve `{ sent: false }` con un `logger.warn`. La cuenta ya existe y el usuario puede pedir un enlace nuevo.
2. **El enlace lo arma el servidor.** `buildVerificationLink({ appUrl, rawToken })` usa `APP_URL` (config), nunca un `Host` del request: un header manipulado no puede redirigir la verificación a otro dominio.
3. **El token crudo viaja solo en el correo.** A la base se persiste únicamente su SHA-256 (`hashToken`). Logs y respuestas HTTP nunca incluyen el token.
4. **Copy en español y accesible para adultos mayores:** frases cortas, texto plano de respaldo (`text`) junto al `html`, y aviso explícito de vencimiento y de un solo uso.
5. **Nuevo tipo de correo = método nuevo en el puerto** (`sendPasswordResetEmail`, etc.), con su rama en `console` y en `smtp`. No se reutiliza `sendVerificationEmail` cambiando el copy por parámetro.

## Pruebas
- Los tests no tocan SMTP: usan un fake con `sendVerificationEmail` que acumula en un array (`backend/tests/authEmailVerification.test.js`, `createFakeEmailSender()`).
- Un envío real solo se valida contra `docs/smtp-setup.md`; nunca desde la suite automática.
