# 🛠️ Skill: Seguridad de Sesión con JWT

## El Token
- Lo emite `backend/src/modules/auth/infrastructure/JwtTokenService.js`; el caso de uso solo llama a
  `tokenService.sign(payload)`. Ningún controlador firma tokens por su cuenta.
- Claims: exactamente `sub` (id del usuario), `role`, `email` y `sv` (versión de sesión), más
  `iat`/`exp` que agrega `jsonwebtoken` solo al firmar. **Nada más.**
- El payload lo arma `shared/session/sessionVersion.js` (`sessionClaims`). Los cuatro lugares que
  firman un token —login, verificación de correo, login con Google y vinculación de adulto mayor—
  tienen que usarlo: un token sin `sv` se lee como versión 0 y queda inválido en cuanto el usuario
  cambie su contraseña. Ni nombre, ni teléfono,
  ni datos del adulto mayor: el payload de un JWT es legible por cualquiera que lo tenga.
- Vigencia: `JWT_EXPIRES_IN` (default `7d`). No hay refresh token; al vencer, se vuelve a loguear.
- Secreto: `JWT_SECRET` desde el entorno. En `NODE_ENV=production` el backend **no arranca** sin él
  (`config/env.js`, `resolveJwtSecret`). Un secreto por defecto en producción es una sesión regalada.

## Reglas Obligatorias
1. **Un solo error para credenciales inválidas.** Correo inexistente y contraseña incorrecta devuelven
   el mismo `401` con el mismo mensaje. Cambiar el texto, el código o el status según el caso convierte
   el login en un oráculo para averiguar qué correos tienen cuenta.
2. **El bloqueo por intentos no puede ser un oráculo.** Si la cuenta se bloquea tras N intentos
   fallidos, la respuesta del bloqueo tiene que ser indistinguible entre una cuenta que existe y una
   que no (o no responder distinto en absoluto). Es la misma regla que en
   `skills/rate-limiting.md`, aplicada al otro endpoint de `auth`.
   **Excepción registrada (HU-003, L4):** acá el `429 ACCOUNT_LOCKED` aparece solo para cuentas
   reales, así que probando N veces un correo se puede averiguar si tiene cuenta. Se aceptó a cambio
   de que la persona bloqueada entienda qué le pasa, en vez de leer "credenciales inválidas" durante
   15 minutos. Si el producto prioriza no filtrar existencia, el cambio es responder `401` genérico
   mientras dure el bloqueo. Ver `docs/auth-api.md`, sección del bloqueo.
3. **El estado de bloqueo se persiste en el usuario, no en memoria.** Un reinicio del backend no puede
   desbloquear una cuenta: el contador y su vencimiento son parte del documento `User`
   (`failedLoginAttempts`, `lockedUntil`), igual que la evidencia de consentimiento de la Ley 1581.
4. **El bloqueo solo frena la contraseña.** No invalida la sesión ya emitida ni borra la cuenta, y
   vence solo, por reloj: nadie tiene que desbloquear a mano.
5. **Un login exitoso limpia el contador** (`failedLoginAttempts = 0`, `lockedUntil = null`). Si no, una
   cuenta quedaría a un solo error de distancia del bloqueo para siempre.
6. **Rutas privadas: sin token válido no hay respuesta.** El middleware
   `shared/middlewares/authMiddleware.js` es el único guard del backend (`GET /api/auth/me` es el
   ejemplo). En el frontend, la pantalla privada se resuelve con una redirección al login cuando no hay
   sesión, nunca ocultando el contenido después de pedirlo: el pedido no debe salir.
7. **Nada de secretos en el cliente.** El frontend guarda el token que recibe y lo manda en
   `Authorization: Bearer <jwt>`; no conoce `JWT_SECRET` ni decide claims.
8. **Un JWT no se puede retirar solo: la sesión se cierra con la versión.** `authMiddleware` lee el
   usuario en cada request autenticado y compara el claim `sv` contra `sessionVersion`. Subir la
   versión (lo hace el reset de contraseña) es "cerrar todas las sesiones". El costo está asumido:
   un `findById` por id indexado en cada request de los cuatro routers protegidos. La alternativa
   —confiar solo en el `exp`— deja viva hasta 7 días una sesión abierta con la contraseña vieja.

## Pruebas
- Un `200` con token, un `401` idéntico para los dos motivos de falla, el bloqueo a los N intentos, el
  vencimiento del bloqueo por reloj y el contador que se limpia con un login correcto.
- El guard se prueba pidiendo una ruta privada sin token y con un token inválido: los dos casos tienen
  que rebotar, no solo el primero.
