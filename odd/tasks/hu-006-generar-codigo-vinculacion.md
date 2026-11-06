# HU-006 — Generar un código de vinculación

Rama: `hu-006-generar-codigo-vinculacion` (desde `dev-Esteban-Trujillo`, que ya incluye HU-005).
Riesgo: alto (item 2 — el código es la credencial con la que un teléfono reclama un perfil; item 3 — cambia
`POST /api/pairing/codes` y el canje, que consume la app móvil ya publicada).

## Specs

S1. Del backlog, criterio 1 (verbatim): "Genera un código de 6 dígitos y una imagen QR con vigencia de 24 horas."
   - El código es de **6 dígitos numéricos** (`/^\d{6}$/`, ceros a la izquierda válidos). La descripción del
     backlog dice "alfanumérico de 6 dígitos"; se resuelve con el criterio de aceptación y con la regla de UI del
     adulto mayor (tipear 36 símbolos en un teléfono es peor que 10). La entropía perdida se cubre con el límite
     de intentos, no con el alfabeto. Decisión registrada en el `## Log`.
   - Vigencia por defecto **1440 minutos (24 h)**, configurable con `PAIRING_TTL_MINUTES`. El valor vigente hoy
     es 15 minutos: cambia el default y la copy del panel.
   - La respuesta sigue incluyendo `qrCodeDataUrl` (el QR no cambia de forma).

S2. Del backlog, criterio 2 (verbatim): "Invalida automáticamente cualquier código de vinculación previo no usado."
   - Al generar un código para un perfil, **todos** los códigos anteriores de ese perfil que no fueron usados
     quedan inválidos en el mismo pedido. Un código invalidado no se puede canjear, y responde igual que uno
     vencido (no se distingue "lo reemplazaron" de "venció": el adulto mayor no puede hacer nada distinto).
   - `usedAt` significa "canjeado". Un código reemplazado se marca con un campo propio (`invalidatedAt`) para no
     mentir en los datos ni en los mensajes de error.
   - La invalidación ocurre **antes** de crear el código nuevo: si la creación falla, el familiar queda sin
     código nuevo y con el anterior ya inválido (falla cerrado, y puede pedir otro).

S3. Del backlog, criterio 3 (verbatim): "Impide generar nuevos códigos si el perfil ya figura como vinculado."
   - El pedido pasa a exigir `seniorId`: el código pertenece a un perfil concreto, no a la cuenta.
   - Perfil `LINKED` (o anterior a HU-005, sin `linkStatus`) ⇒ `409 SENIOR_ALREADY_LINKED`.
   - Perfil de otro familiar, inexistente o con rol `CAREGIVER` ⇒ `404 SENIOR_NOT_FOUND` (misma regla de HU-005:
     un 403 confirmaría que el id existe).
   - `seniorId` ausente o mal formado ⇒ `400 SENIOR_ID_REQUIRED`. Sin `seniorId` ya no se emiten códigos sueltos.

S4. Canje de un solo uso, en serio (seguridad, alcance de esta HU porque toca el mismo ciclo):
   - El canje reclama el código con una escritura condicional atómica (`usedAt: null`, `invalidatedAt: null`,
     vigente) y solo el pedido que gana la carrera sigue; el otro recibe el mismo `409` genérico.
   - Hoy el canje hace `findByCode` → mirar `usedAt` → crear el senior → `markUsed`: dos pedidos simultáneos
     pasan los dos y se crean **dos seniors** con un código. Es el mismo defecto que HU-004 corrigió para el
     token de reseteo.
   - Debe cubrirse con un test de canje concurrente, no solo secuencial.

S5. Contrato HTTP (congelado para el frontend y para la app móvil):

```
POST /api/pairing/codes      auth: cuidador
  body: { "seniorId": "507f1f77bcf86cd799439011" }
  201:  { "code": "482913", "expiresAt": "<iso>", "seniorId": "...", "qrCodeDataUrl": "data:image/png;base64,..." }
  400 SENIOR_ID_REQUIRED · 404 SENIOR_NOT_FOUND · 409 SENIOR_ALREADY_LINKED

POST /api/pairing/link       público (la app del adulto mayor usa el código como credencial)
  body: { "code": "482913", "fullName": "...", "phone": "..." }   // fullName/phone opcionales desde esta HU
  201:  { "token": "<jwt>", "senior": { ...toPublicUser de auth + linkStatus + timezone } }
  400 código con formato inválido / vencido / invalidado (mensaje genérico, sin decir cuál)
  404 código inexistente · 409 ya canjeado o el perfil ya está vinculado
```

El `senior` del canje **conserva la proyección que ya consume la app publicada** (`toPublicUser`: id, email,
fullName, role, phone, caregiverId, emailVerified, createdAt) y se le suman `linkStatus` y `timezone`. No se
cambia a la proyección de HU-005 (`toPublicSenior`) porque eso le quitaría campos a un cliente ya desplegado y
no es lo que pide esta HU: `linkStatus`/`timezone` son aditivos.

S6. Compatibilidad con la app publicada (no se rompe lo que ya funciona):
   - Un código **sin** `seniorId` (emitido antes de esta HU, o por un APK viejo que pide `/codes` sin perfil)
     sigue canjeándose con el comportamiento anterior: crea el senior y lo deja `LINKED`. Esa rama es
     transitoria y queda documentada como tal, con test propio, hasta que la app móvil de HU-007 exija el
     perfil. Sin esta rama, todo senior que hoy tenga un código en la mano queda sin poder vincular.
   - Un código **con** `seniorId` canjea **ese** perfil: no crea otro senior, lo pasa a `LINKED` y emite el
     token para él. El `fullName`/`phone` del cuerpo no pisan los datos del perfil (el familiar es el dueño de
     esos datos; el teléfono no edita la ficha).

S7. Panel del cuidador (`frontend/src/features/pairing/ui/PairingCodePanel.jsx`):
   - Selector del perfil pendiente; si no hay ninguno pendiente, no se puede generar y se explica por qué.
   - La copy dice 24 horas, no 15 minutos.
   - Si el perfil ya está vinculado, el panel lo dice y no ofrece generar.

S8. Documentación y skills: `skills/pairing-generator.md` y `skills/qr-adapter.md` (no existen), y
   `docs/pairing-api.md` con el contrato de S5. `docs/seniors-api.md` se corrige donde dice que el código no
   está atado a un perfil.

## Tasks

- T1 · S1, S3, S5 · backend: `seniorId` obligatorio, TTL 24 h, rechazos 400/404/409, schema (`invalidatedAt`)
- T2 · S2, S4 · backend: invalidación de previos + reclamo atómico del canje + tests de concurrencia
- T3 · S5, S6 · backend: canje que pasa el perfil a `LINKED` + rama de compatibilidad sin `seniorId`
- T4 · S7 · frontend: selector de perfil pendiente, copy de 24 h, estados de "ya vinculado"
- T5 · S8 · docs + skills (`pairing-generator.md`, `qr-adapter.md`, `docs/pairing-api.md`)
- T6 · cierre: suite + build, verificación independiente, backlog y `ACTIVE_TASK` a HU-007

T1–T3 van en un solo commit de backend: son el mismo ciclo del código (emitir → invalidar → canjear) y separarlos
dejaría un estado intermedio donde el panel ya manda `seniorId` y el canje todavía no lo entiende.

## Log

L1. Pedido del usuario (verbatim): "vale sigamos con el flujo que llevamos"
L2. Estado de partida: `POST /api/pairing/codes` genera un código suelto, sin `seniorId`; TTL 15 minutos
(`config.pairing.ttlMinutes`, `PAIRING_TTL_MINUTES`); `PairingCode` ya tiene `seniorId String?`; el canje
(`LinkSeniorApp`) hace `findByCode` → mirar `usedAt` → crear senior → `markUsed`.
L3. Decisión de alcance (S1): el criterio de aceptación dice "6 dígitos" y la descripción "alfanumérico de 6
dígitos". Se implementan 6 dígitos numéricos: es lo que valida el criterio, es lo que ya hace el generador, y el
adulto mayor tipea dígitos, no letras. Un espacio de 10^6 no es seguro por sí solo, pero el límite de intentos
(5 fallos / 15 min, HU-007) lo cubre; si se quisiera alfanumérico, cambian el generador y la copy, no la
arquitectura.
L4. Decisión de compatibilidad (S6): no se puede romper el canje de la app ya publicada. La rama sin `seniorId`
se conserva y se marca como transitoria, con test, para que HU-007 la pueda retirar cuando el APK nuevo exija el
perfil.
L5 (corrección de S5 durante la implementación). La primera versión congelaba `senior` como la proyección de
HU-005 (`toPublicSenior`), y eso le quitaba `role`, `email`, `phone` y `caregiverId` a la respuesta que la app
publicada ya consume: un cambio de contrato que esta HU no pide. Se corrige: el canje devuelve `toPublicUser`
como antes, más `linkStatus` y `timezone` (aditivos). La proyección estricta queda para `GET /api/seniors`, que
nació sin clientes viejos.
