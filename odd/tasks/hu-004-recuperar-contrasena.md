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
| T1 | S1-S2 | pendiente | — |
| T2 | S3 | pendiente | — |
| T3 | S4 | pendiente | — |

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
