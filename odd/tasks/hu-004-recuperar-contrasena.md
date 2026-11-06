# HU-004 — Recuperar mi contraseña

Cierra HU-004 de `skills/ACTIVE_TASK`: enlace temporal por correo para restablecer la contraseña.
Rama: `hu-004-recuperar-contrasena`, creada desde `dev-Esteban-Trujillo` (en `b6511c7`).

## Specs

S1. "Retorna un mensaje genérico de confirmación exista o no el correo ingresado."

S2. "El enlace de restablecimiento funciona una sola vez y expira en 60 minutos."

S3. "Invalida tokens de sesión previos tras completar el cambio de clave."

S4. Cierre: marcar `- [x] **HU-004**` en `skills/backlog_del_proyecto.md`, actualizar el puntero y
   sobrescribir `skills/ACTIVE_TASK` con HU-005.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1-S2 | inline | `bfb69ae` |
| T2 | S3 | inline | `4221c30` |
| T3 | S4 | inline | cierre |

Bordes de slice: `bfb69ae` es el enlace de restablecimiento con sus tests; `4221c30` es el cierre de
sesiones, que toca el middleware compartido por cuatro routers y por eso va aparte; el cierre va
último. Los tres slices son de tamaño revisable (el conteo del aviso se mide contra `origin/main`, que
no es la base de esta rama).

## Log

L1 (user, verbatim):

> continua con al siguiente ya que aun tiens bastante ventana de contexto

L2 (decisión, S3, consultada al usuario). Respuesta del usuario: "la que cumpla con los criterios de
aceptación y que vaya según lo que ya haya hecho en otro lado". Se elige **versión de sesión en el
usuario** (`sessionVersion`), no la comparación contra el `iat` del token:

- Cumple el criterio de forma determinista. `iat` de `jsonwebtoken` tiene resolución de segundos, así
  que comparar contra una fecha de cambio puede rechazar un token legítimo emitido en el mismo
  segundo o dejar pasar uno viejo según el orden de los decimales.
- Es el patrón que ya usa el proyecto: campo nullable en `User` (`failedLoginAttempts`, `lockedUntil`
  en HU-003) y una regla pura aparte, sin estado en memoria.
- Deja resuelto, gratis, un "cerrar sesión en todos los dispositivos" para cuando se pida.

Costo asumido: `authMiddleware` pasa a leer el usuario en cada request autenticado (un `findById` por
id indexado). Sin eso no hay forma de invalidar un token ya emitido, porque el JWT es sin estado.

Tokens emitidos antes de este cambio no traen el claim: se aceptan mientras la versión guardada sea
0/null, y quedan inválidos en cuanto el usuario cambie su contraseña. Es el comportamiento buscado:
nadie pierde la sesión por un despliegue.

L3 (decisión, alcance de S3). El reset exitoso hace tres cosas en el mismo documento del usuario:
guarda la contraseña nueva, sube `sessionVersion` (mata las sesiones anteriores) y limpia
`failedLoginAttempts`/`lockedUntil`. Lo último es necesario porque quien acaba de demostrar que
controla el correo no debería quedar bloqueado 15 minutos por los intentos fallidos previos.

L4 (evidence, observado):
- `backend: npm test` -> **116 tests, 116 pass, 0 fail** (96 antes de esta HU). Los 20 nuevos se
  vieron en RED primero: 11 del enlace de restablecimiento y 9 de la versión de sesión.
- `prisma validate` y `prisma generate` OK con `PasswordResetToken` y `sessionVersion`.
- Reparto en dos slices: `bfb69ae` (S1-S2: enlace de un solo uso, 60 min) y `4221c30` (S3: cierre de
  sesiones con el claim `sv`). Separados porque el segundo toca un middleware compartido por cuatro
  routers y conviene revisarlo solo.
- No corrido: `prisma db push` (colección nueva y campo nullable; Mongo no necesita nada) ni un envío
  SMTP real.

L5 (decisión, ubicación de la regla de sesión). `sessionVersion.js` no vive en el slice de auth sino en
`shared/session/`: el middleware compartido no puede importar de un slice —su propio comentario lo
prohíbe y `pairing` también firma tokens—, así que la regla que comparten los cuatro emisores tampoco
pertenece a `auth/domain`.

L6 (riesgo residual aceptado). `authMiddleware` ahora lee la base en cada request autenticado. Si Mongo
no responde, esos endpoints devuelven el error tal cual en vez de seguir con claims viejos: se eligió
fallar cerrado. El costo de latencia es una decisión consciente y está documentada en
`skills/jwt-security.md` regla 8.

L7 (verificación independiente `gentle-ai-verify`, con probes reproducidos). Veredicto: S1 PASS, S3
PASS, S4 PASS (el cierre ya estaba hecho), **S2 FAIL** por concurrencia. Dos bloqueantes reales, ambos
en el orden de las operaciones del canje:
- **B1** — dos pedidos simultáneos con el mismo enlace pasaban los dos: `findByHash` → mirar `usedAt` →
  hashear (bcrypt, ~100 ms) → escribir → `markUsed`. La ventana entre mirar y marcar es enorme, así que
  quien tenga un token robado puede correr al dueño y terminar con la contraseña. El "un solo uso" era
  cierto solo en secuencia.
- **B2** — la contraseña se escribía **antes** de quemar el token: si `markUsed` fallaba, la cuenta
  quedaba con la contraseña nueva y el enlace seguía vivo, y el mismo enlace volvía a cambiarla
  después.
Corregido: el token se reclama con un `updateMany` condicionado a `usedAt: null` **antes** de tocar la
cuenta, y si no lo ganó se responde el mismo `400` genérico. Consecuencia buscada: un fallo al escribir
deja la cuenta intacta y el enlace quemado (falla cerrado). Tres tests nuevos lo pinnean (canje
concurrente, fallo al consumir, y la vigencia tomada de la config en vez de un 60 hardcodeado), más
uno HTTP que cruza Express de verdad. Mutación comprobada a mano: ignorando el resultado del reclamo,
el test de concurrencia falla; restaurado, 15/15.

L8 (otros hallazgos del verificador y qué se hizo con cada uno):
- Token sin `sub` en el claim: era `500` de Prisma; ahora es `401` antes de tocar la base.
- Fuga por tiempo en `forgot-password`: el envío se espera dentro del request, así que una cuenta real
  tarda ~250 ms y un correo desconocido ~5 ms. El cuerpo y el status son idénticos —el criterio se
  cumple—, pero queda como deuda anotada en `docs/auth-api.md` y en el comentario del caso de uso,
  porque sacarlo del camino de la respuesta cambia el manejo de errores de entrega y conviene hacerlo
  junto con el reenvío de verificación, que tiene la misma forma.
- `skills/email-adapter.md` decía que el token nunca aparece en logs, y el canal `console` lo imprime a
  propósito cuando no hay SMTP. Corregido con la excepción explícita y la consecuencia: producción
  necesita SMTP configurado.
- Deuda preexistente, fuera de esta HU: `VerifyEmail` tiene el mismo TOCTOU (doble uso re-verifica y
  emite dos sesiones, pero no consume ningún secreto) y Socket.IO no valida token en el handshake, así
  que el cierre de sesiones no cubre el canal en tiempo real. Se dejan anotados acá para que no se
  pierdan.
- **B3, decisión de alcance pendiente**: el enlace apunta a `${APP_URL}/reset-password?token=…` y esa
  ruta no existe en el frontend (`AppRouter.jsx`), así que hoy la persona cae en el login. El criterio
  de la HU se cumple a nivel API; para que el flujo sea usable falta la pantalla.
