# Reglas del generador de códigos de vinculación — HU-006

El código es la credencial con la que el teléfono del adulto mayor reclama un perfil. Se lee antes
de tocar `backend/src/modules/pairing/`.

## 1. Forma y espacio

- 6 dígitos numéricos: `/^\d{6}$/`. Ceros a la izquierda válidos (`"000123"` es un código).
- Se rechaza todo lo demás: 5 o 7 dígitos, letras, espacios, tipos que no son string.
- Son 10^6 combinaciones. Eso **no** es seguro por sí solo: la defensa es el límite de intentos
  (HU-007) y la vigencia. No se agranda el alfabeto para compensar; se limita el intento.
- La descripción del backlog dice "alfanumérico de 6 dígitos". Se implementó numérico: lo valida el
  criterio de aceptación, es lo que el adulto mayor puede tipear en un teléfono y es lo que el
  generador ya hacía. Cambiar a alfanumérico toca generador y copy, no la arquitectura.

## 2. Vigencia

- 24 horas por defecto (`PAIRING_TTL_MINUTES`, default `1440`). Configurable por entorno, un solo
  número en la config, nunca hardcodeado en el caso de uso.
- La fecha de vencimiento se calcula al emitir y se devuelve en `expiresAt`. El cliente muestra esa
  fecha; no inventa "24 horas" a mano al lado de una hora real.
- Un código vencido se comporta igual que uno reemplazado: no se puede canjear y no se distingue
  cuál de los dos fue.

## 3. Un código por perfil, y solo para perfiles pendientes

- El pedido exige `seniorId`: el código pertenece a un perfil, no a la cuenta. Sin `seniorId` no se
  emite (`400 SENIOR_ID_REQUIRED`).
- Perfil de otro familiar, inexistente o con rol `CAREGIVER` ⇒ `404 SENIOR_NOT_FOUND`. Un 403
  confirmaría que el id existe.
- Perfil ya vinculado ⇒ `409 SENIOR_ALREADY_LINKED`. Un documento sin `linkStatus` cuenta como
  vinculado: es anterior a HU-005 y se creó por el canje.
- Emitir invalida **todos** los códigos previos no usados de ese perfil (`invalidatedAt`), antes de
  crear el nuevo. `usedAt` (canjeado) y `invalidatedAt` (reemplazado) son hechos distintos: no se
  reutiliza uno para el otro.

## 4. Canje

- El reclamo es una escritura condicional atómica (`usedAt: null`, `invalidatedAt: null`, vigente).
  Solo el pedido que gana sigue; el resto recibe el mismo 409 genérico. Nada de leer, mirar y
  escribir después: esa ventana es la que permite dos canjes del mismo código.
- El reclamo va **antes** de escribir el perfil: si la escritura falla, el código queda quemado. La
  alternativa deja un código vivo con un perfil ya vinculado.
- Un código con `seniorId` vincula ese perfil; uno sin `seniorId` (legacy) crea el senior, rama que
  existe solo para el APK ya publicado y que HU-007 retira.

## 5. Lo que no se hace

- No se generan códigos sueltos "por si acaso", ni varios activos para el mismo perfil.
- No se reutiliza un código vencido ni se extiende su vigencia: se emite uno nuevo, que invalida el
  anterior.
- No se loguea el código completo en producción (el log de arranque y los errores no lo incluyen).
- No se acepta un `caregiverId` del cuerpo: sale siempre de la sesión.

## 6. Dónde vive

- Reglas puras y TTL: `backend/src/modules/pairing/domain/pairingCode.js`.
- Emisión: `application/GeneratePairingCode.js` · Canje: `application/LinkSeniorApp.js`.
- Persistencia y reclamo atómico: `infrastructure/PrismaPairingRepository.js`.
- Contrato: `docs/pairing-api.md`. QR: `skills/qr-adapter.md`.
