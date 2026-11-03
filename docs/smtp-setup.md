# Configurar el correo de verificación (SMTP)

El backend manda el enlace de verificación por SMTP. Sin SMTP el enlace **solo** se imprime en el
log del contenedor: sirve para probar, no para usuarios reales.

Todo lo de abajo se hace en el servidor, sobre el archivo `.env` de la raíz del proyecto (no está en
git, se edita a mano).

---

## Paso 0 — Antes de tocar nada

```bash
cd ~/admin/home/projects/victor/Plataforma_de_Acompa-amiento_para_Adultos_Mayores
docker compose logs backend | grep "email delivery"
```

- `email delivery: console` → hay que configurar SMTP (seguí abajo).
- `email delivery: smtp (host:puerto)` → ya hay SMTP, el problema es otro.

Y confirmá que el link apunta a un dominio real, porque se arma con `APP_URL`:

```bash
grep -E "^APP_URL=" .env
```

Si dice `http://localhost:3201`, cambialo por el dominio público (ej. `https://tu-dominio.top`).
Un usuario que abra `localhost` desde su celular nunca va a verificar la cuenta.

---

## Opción A — Gmail con contraseña de aplicación (rápido, para probar hoy)

Sirve para validar el flujo completo sin tocar DNS. Límite: ~500 correos por día.

1. En la cuenta de Gmail: activar **verificación en dos pasos** (es requisito).
2. Ir a <https://myaccount.google.com/apppasswords> → crear una contraseña de aplicación
   ("Otra" → nombre `plataforma`). Google muestra **16 caracteres**: copiarlos sin espacios.
3. Editar el `.env`:

```bash
nano .env
```

```ini
APP_URL=https://tu-dominio.top

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASS=los16caracteresdelapppassword
SMTP_FROM="Plataforma de Acompañamiento <tu-cuenta@gmail.com>"
```

`SMTP_FROM` **tiene que ser la misma cuenta** de `SMTP_USER`, si no Gmail rechaza el envío (error
`553`). `SMTP_SECURE=false` porque el 587 negocia TLS solo; con el 465 va `true`.

---

## Opción B — SMTP del hosting o dominio propio (producción)

Si tu dominio ya manda correo (cPanel, Zoho, Hostinger), usá esos datos:

```ini
SMTP_HOST=mail.tu-dominio.top
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@tu-dominio.top
SMTP_PASS=la-clave-del-buzon
SMTP_FROM="Plataforma de Acompañamiento <no-reply@tu-dominio.top>"
```

Principio de 2024 en adelante: un `FROM` con dominio propio sin **SPF** y **DKIM** en el DNS termina
en spam o rebotado. Si el panel del hosting no te lo configuró, pedilo antes de mandar correos reales.

---

## Opción C — Servicio transaccional (Brevo, Resend, SendGrid)

Más confiable para producción y con plan gratuito. Ejemplo con Brevo (300 correos/día):

1. Crear cuenta en <https://www.brevo.com> y **verificar el dominio** (te da los registros SPF/DKIM
   para pegar en el DNS de tu dominio).
2. En *SMTP & API → SMTP* copiar la **clave SMTP** (no es la contraseña de la cuenta).
3. `.env`:

```ini
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-correo-de-la-cuenta@ejemplo.com
SMTP_PASS=la-clave-smtp-que-te-da-brevo
SMTP_FROM="Plataforma de Acompañamiento <no-reply@tu-dominio.top>"
```

Con Resend el host es `smtp.resend.com`, el usuario **`resend`** literal y la clave es la API key.

---

## Paso final — Aplicar y verificar (igual para las tres opciones)

El `.env` se lee al **crear** el contenedor, así que hay que recrearlo:

```bash
docker compose up -d --force-recreate backend
docker compose logs backend | grep "email delivery"
```

Tiene que decir `email delivery: smtp (smtp.gmail.com:587)` (o el host que uses).

Prueba real de punta a punta:

```bash
PUERTO=$(docker compose port backend 3500 | cut -d: -f2)
curl -s -X POST "http://localhost:${PUERTO}/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"TU_CORREO_REAL@gmail.com","password":"secreto-largo","fullName":"Prueba SMTP"}'
```

Respuesta esperada: `{"user":{...,"emailVerified":false},"verificationSent":true}`.

Después:

1. Abrí el correo (revisá spam la primera vez).
2. Tocá el botón → te lleva a `/verify-email?token=...` y te deja logueado.
3. Cerrá sesión y volvé a entrar: el login ya funciona porque la cuenta quedó verificada.

Si querés probar **sin** SMTP (solo el flujo), el link se lee del log:

```bash
docker compose logs backend | grep "Enlace de verificación" | tail -1
```

---

## Errores típicos

| Síntoma en el log | Causa | Arreglo |
|---|---|---|
| `EENVELOPE` / `553 From address not verified` | `SMTP_FROM` no coincide con el usuario o el dominio no está verificado | Alinear `SMTP_FROM` con `SMTP_USER` o verificar el dominio |
| `535 Authentication failed` | Clave incorrecta, o clave normal de Gmail en lugar de app password | Regenerar app password / clave SMTP |
| `ETIMEDOUT` / `ECONNREFUSED` en 587 | Salida al puerto bloqueada por el firewall del VPS | `ufw allow out 587/tcp` (y 465 si usás `SMTP_SECURE=true`) |
| `self signed certificate in certificate chain` | SMTP con certificado inválido | Usar 587 con `secure=false` o el certificado correcto |
| El mail no llega y no hay error | Cayó en spam, o `APP_URL` apunta a localhost y el link no sirve | Revisar spam, corregir `APP_URL` |
| `verificationSent: false` en la respuesta | El envío falló; el token igual quedó emitido | Corregir SMTP y usar "Reenviar el enlace" |

Los tokens vencen a las 24 horas y son de un solo uso; el reenvío invalida el anterior.
