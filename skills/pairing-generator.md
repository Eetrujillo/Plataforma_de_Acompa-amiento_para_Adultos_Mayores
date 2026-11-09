# Reglas del token de vinculación — HU-006

El token es la credencial con la que el teléfono del adulto mayor reclama un perfil, y viaja
**sólo** dentro del QR. No hay código legible, no se dicta, no se tipea. Se lee antes de tocar
`backend/src/modules/pairing/`.

## 1. Forma y espacio

- Token opaco de 32 bytes de azar criptográfico en base64url sin relleno: 43 caracteres, 256 bits
  (`/^[A-Za-z0-9_-]{43}$/`). Se rechaza cualquier otra cosa antes de hashear.
- En la base se guarda **sólo `sha256(token)`** (`tokenHash`), como el token de verificación de
  correo: quien lea la colección no puede reconstruir un QR válido.
- Consecuencia buscada: el espacio de 10^6 combinaciones de un código de 6 dígitos desaparece.
  Adivinar un token de 32 bytes no es viable, así que el límite de intentos deja de ser lo que
  sostiene la seguridad del canje (se mantiene igual, como defensa en profundidad, en HU-007).
- Nunca se loguea el token en claro, ni entra a un mensaje de error ni al cuerpo de una respuesta
  de emisión. La única copia en claro es la imagen del QR.

## 2. Vigencia

- 24 horas por defecto: `PAIRING_TOKEN_TTL_MINUTES = 1440`, configurable con `PAIRING_TTL_MINUTES`.
  Un solo número en la config, nunca hardcodeado en el caso de uso.
- La fecha de vencimiento se calcula al emitir y se devuelve en `expiresAt`. El cliente muestra esa
  fecha; no inventa "24 horas" a mano al lado de una hora real.
- Un token vencido se comporta igual que uno reemplazado: no se puede canjear y no se distingue
  cuál de los dos fue.

## 3. Un token por perfil, y solo para perfiles pendientes

- El pedido exige `seniorId`: el token pertenece a un perfil, no a la cuenta. Sin `seniorId` no se
  emite (`400 SENIOR_ID_REQUIRED`).
- Perfil de otro familiar, inexistente o con rol `CAREGIVER` ⇒ `404 SENIOR_NOT_FOUND`. Un 403
  confirmaría que el id existe.
- Perfil ya vinculado ⇒ `409 SENIOR_ALREADY_LINKED`. Un documento sin `linkStatus` cuenta como
  vinculado: es anterior a HU-005 y se creó por el canje.
- Emitir invalida **todos** los tokens previos no usados de ese perfil (`invalidatedAt`), antes de
  crear el nuevo. `usedAt` (canjeado) e `invalidatedAt` (reemplazado) son hechos distintos: no se
  reutiliza uno para el otro.

## 4. Orden de la emisión: token → QR → persistir

1. Se valida el perfil (existe, es del cuidador, sigue pendiente).
2. Se genera el token.
3. Se codifica el QR. Si falla, `503 PAIRING_QR_UNAVAILABLE` y **no se toca nada**: ni el token
   anterior se invalida ni se crea el nuevo. Es el orden que corrige el defecto de dejar al
   familiar con el QR viejo muerto y sin uno nuevo.
4. Se invalidan los tokens anteriores del perfil.
5. Se persiste el hash con `expiresAt`.

Si el paso 5 falla, el perfil queda con el token anterior ya inválido (falla cerrado) y el familiar
pide otro. Sin QR no hay credencial: no se responde `201` con la imagen vacía.

## 5. Canje

- El reclamo es una escritura condicional atómica (`usedAt: null`, `invalidatedAt: null`,
  vigente). Solo el pedido que gana sigue; el resto recibe el mismo 409 genérico. Nada de leer,
  mirar y escribir después: esa ventana permite dos canjes del mismo token.
- El reclamo va **antes** de escribir el perfil: si la escritura falla, el token queda quemado. La
  alternativa deja un token vivo con un perfil ya vinculado.
- El canje no crea perfiles y no acepta datos de la ficha: el cuerpo sólo lleva `token`.
- No existe rama legacy. El canje por código tipeado se retiró con el código mismo (L9).

## 6. Lo que no se hace

- No hay código de 6 dígitos, ni alfanumérico, ni campo de entrada manual: no se muestra en el
  panel, no se dicta por teléfono, no se tipea en la app.
- No se generan tokens sueltos "por si acaso", ni varios activos para el mismo perfil.
- No se reutiliza un token vencido ni se extiende su vigencia: se emite uno nuevo, que invalida el
  anterior.
- No se acepta un `caregiverId` del cuerpo: sale siempre de la sesión.

## 7. Dónde vive

- Reglas puras y TTL: `backend/src/modules/pairing/domain/pairingToken.js`.
- Emisión: `application/GeneratePairingToken.js` · Canje: `application/RedeemPairingToken.js`.
- Persistencia y reclamo atómico: `infrastructure/PrismaPairingRepository.js`.
- Contrato: `docs/pairing-api.md`. QR: `skills/qr-adapter.md`.
