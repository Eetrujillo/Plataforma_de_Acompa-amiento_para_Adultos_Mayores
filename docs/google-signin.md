# Acceso con Google (Google Identity Services)

El botón "Continuar con Google" del login autentica **cuentas que ya existen** en la plataforma.
Google nunca crea cuentas acá: si el correo no tiene cuenta, el backend responde `404`
`EMAIL_NOT_REGISTERED` y la pantalla muestra "Este correo no tiene una cuenta en la plataforma".

El flujo es de **ID token**, no de redirección con `code`:

1. El navegador pide el `id_token` a Google Identity Services con el `client_id` que obtiene en
   tiempo de ejecución de `GET /api/auth/google/config`.
2. El navegador manda ese `id_token` a `POST /api/auth/google`.
3. El backend lo verifica con `google-auth-library` (`OAuth2Client.verifyIdToken`) contra el
   `GOOGLE_CLIENT_ID`, busca la cuenta por el correo del token y devuelve `{ token, user }`.

Por eso **no hace falta Client Secret**: el secreto solo se usa en el flujo de servidor con
`code`; acá el backend valida la firma del token con las claves públicas de Google y el
`client_id` como `audience`.

---

## Paso 1 — Crear el proyecto en Google Cloud

1. Entrá a <https://console.cloud.google.com/> con la cuenta que va a administrar el acceso.
2. Arriba a la izquierda, **Select a project → New project**.
3. Nombre: por ejemplo `Plataforma Acompañamiento`. **Create** y esperá a que quede seleccionado.

## Paso 2 — Configurar la pantalla de consentimiento

1. **APIs & Services → OAuth consent screen**.
2. Tipo de usuario: **External** (los usuarios son el público general, no una organización Workspace).
3. Completá lo obligatorio:
   - **App name**: el nombre visible para el usuario, ej. `Plataforma de Acompañamiento`.
   - **User support email**: un correo que se revise.
   - **Developer contact information**: el mismo correo u otro del equipo.
4. **Save and continue**. En *Scopes* no hay que agregar nada: el flujo de ID token solo usa
   `openid`, `email` y `profile`, que vienen por defecto.
5. En *Test users*, mientras la app esté en **Testing**, agregá los correos de Google con los que
   vas a probar (máximo 100). Si no los agregás, Google rechaza el login antes de llegar al backend.
6. Cuando esté listo para usuarios reales: **Publish app**. Para este flujo no hace falta
   verificación de Google porque solo se piden scopes básicos.

## Paso 3 — Crear el cliente OAuth

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type: Web application**.
3. **Name**: por ejemplo `Web login`.
4. **Authorised JavaScript origins** — sin barra final, sin path:

   | Entorno | Origen |
   | --- | --- |
   | Local (frontend en Docker / VS Code) | `http://localhost:3202` |
   | Local (Vite directo) | `http://localhost:3201` |
   | Producción | `https://tu-dominio.top` (el dominio real del frontend) |

   Si el origen no está en la lista, el navegador falla con `origin_mismatch` y el backend nunca
   recibe el token.

5. **Authorised redirect URIs**: no se usan en este flujo. Dejalo vacío.
6. **Create**. Google muestra el **Client ID** (algo como
   `1234567890-abcdefg.apps.googleusercontent.com`) y un Client Secret. **Copiá solo el Client ID**:
   el secret no se usa y no debe ir al frontend ni al `.env`.

## Paso 4 — Configurar el backend

Editá el `.env` de la raíz del proyecto (no está en git) o `backend/.env` si corrés el backend en
el host:

```bash
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
```

Reiniciá el backend. `GOOGLE_CLIENT_ID` es **público**: se entrega al navegador por
`GET /api/auth/google/config` para que el bundle sirva igual en local y en el VPS sin recompilar ni
tocar `docker-compose.yml`.

Sin `GOOGLE_CLIENT_ID`, el endpoint de configuración responde `{ "enabled": false, "clientId": null }`,
el botón se muestra deshabilitado con un aviso y `POST /api/auth/google` responde `503`
`GOOGLE_NOT_CONFIGURED` (nunca finge funcionar).

## Paso 5 — Verificar

Con el backend arriba (por defecto en `http://localhost:3500`):

```bash
curl -s http://localhost:3500/api/auth/google/config
```

Configurado:

```json
{ "enabled": true, "clientId": "1234567890-abcdefg.apps.googleusercontent.com" }
```

Sin configurar:

```json
{ "enabled": false, "clientId": null }
```

Después, en el navegador, abrí el login desde el origen autorizado, tocá el botón de Google y
mirá la pestaña Network: `POST /api/auth/google` debe responder `200` con `{ token, user }`, o
`404 EMAIL_NOT_REGISTERED` si el correo no tiene cuenta.

### Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| El botón no aparece o está deshabilitado | `GOOGLE_CLIENT_ID` vacío o backend sin reiniciar |
| `origin_mismatch` en el navegador | el origen actual no está en *Authorised JavaScript origins* |
| `404 EMAIL_NOT_REGISTERED` | el correo de Google no tiene cuenta; se registra primero por el formulario |
| `401 UNAUTHORIZED` | token vencido, `audience` de otro cliente, o token sin correo |
| `503 GOOGLE_NOT_CONFIGURED` | el backend no leyó `GOOGLE_CLIENT_ID` |

## Qué garantiza el backend

- Verifica firma, vencimiento y `audience` del `id_token`. Cualquier falla es `401 UNAUTHORIZED`
  sin detalles internos (el error de la librería no se filtra).
- Normaliza el correo a minúsculas antes de buscar, igual que el login por contraseña.
- Si la cuenta existía sin verificar, la marca como verificada (`emailVerifiedAt`): Google ya
  certificó el dominio del correo.
- Nunca crea cuentas ni modifica la contraseña.
