# HU-009 — Canje del QR de vinculación, consentimiento del titular y bloqueo de intentos

Rama: `chore/deploy-mongoose`. **Alcance de este round: sólo el backend del canje**
(`POST /api/pairing/redeem`). La app React Native del adulto mayor no existe en el repo, así que los
criterios que viven en la pantalla (rechazar un sobre ajeno, mostrar el consentimiento, guardar el
token cifrado) quedan como contrato escrito, no como código: se listan abajo marcados `cliente`.

Código: `backend/src/modules/pairing/` (canje nuevo dentro del slice de HU-008),
`backend/src/config/env.ts`, composición en `index.ts` y `server.ts`, contrato en
`docs/pairing-api.md`.

## Specs

### Del backlog (HU-009)

**S1** (HU-009, `cliente`) — «Rechaza un QR cuyo payload no sea `senior-pairing` sin llamar al
backend.»

**S2** (HU-009, `cliente`) — «Muestra el consentimiento con texto ≥ 20pt **antes** del canje.»

**S3** (HU-009, `cliente`) — «Si el adulto mayor rechaza el consentimiento, cancela el proceso y no
guarda nada.»

**S4** (HU-009) — «Con QR válido y consentimiento aceptado, vincula el dispositivo y guarda el
token.» En el backend: el perfil pasa a `LINKED` y el canje devuelve una sesión de `SENIOR`.

**S5** (HU-009) — «Registra fecha, hora y versión del consentimiento aceptado.»

**S6** (HU-009, `cliente`) — «QR vencido o ya usado muestra exactamente **"Pídele a tu familiar un QR
nuevo"**.» El backend responde el genérico de S13; esa cadena es de la app.

**S7** (HU-009) — «Bloquea nuevos intentos 15 minutos tras 5 fallos consecutivos.»

**S8** (HU-009) — «El canje es una escritura condicional atómica: dos escaneos simultáneos del mismo
QR producen un solo vínculo y el resto recibe 409.»

**S9** (HU-009, `cliente`) — «El cliente no reintenta un 409 automáticamente: pide un QR nuevo.»

**S10** (HU-009, `cliente`) — «El token de dispositivo se guarda cifrado en el almacenamiento local
(MMKV), nunca en texto plano ni en logs.»

### Del contrato (`docs/pairing-api.md`, `POST /api/pairing/redeem`)

**S11** — «El teléfono del adulto mayor no tiene sesión todavía: el token del QR es la credencial.»
Ruta pública, sin `Authorization`.

**S12** — Cuerpo exacto del pedido: «`{ "token": "«43 caracteres base64url»" }`» y «El cuerpo sólo
lleva `token`» (S18 lo repite abajo).

**S13** — Respuesta exacta del canje:

```http
201 Created

{
  "token": "<jwt>",
  "senior": { "id": "...", "email": "senior+...@seniors.local", "fullName": "Rosa Pérez",
              "role": "SENIOR", "phone": null, "caregiverId": "...", "emailVerified": true,
              "createdAt": "...", "linkStatus": "LINKED", "timezone": "America/Bogota" }
}
```

**S14** — Tabla de errores del canje, con los códigos y los status exactos:

| `error.code` | Status | Cuándo |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Token con forma inválida, vencido o invalidado. Mismo mensaje genérico en los tres casos. |
| `NOT_FOUND` | 404 | El token está bien formado pero la base no lo conoce. |
| `CONFLICT` | 409 | Ya fue canjeado, o el perfil del token ya no es del mismo familiar. |
| `SENIOR_ALREADY_LINKED` | 409 | El perfil del token ya está vinculado: el QR no se quema. |

**S15** — Mensajes exactos, textual: «`pairing token is invalid or expired`, `pairing token not
found`, `pairing token already used`» en inglés; «`SENIOR_ALREADY_LINKED` sí está en español porque
también lo muestra el panel».

**S16** — «El reclamo es una escritura condicional: `usedAt: null`, `invalidatedAt: null` y vigente,
en una sola operación. Solo el pedido que gana la carrera sigue; el otro recibe el mismo 409
genérico.»

**S17** — «Antes de reclamar, el canje valida que el perfil siga existiendo, que **siga siendo del
dueño del token** y que siga pendiente: un perfil ya vinculado no debe quemar un token que todavía
sirve. Un perfil ajeno responde igual que un token consumido, para no confirmar que el id existe.»

**S18** — «Si la escritura del perfil falla **después** del reclamo, el token ya quedó quemado (falla
cerrado) y el familiar genera otro.»

**S19** — «El canje **no acepta datos de la ficha** (`fullName`, `phone`): el perfil ya existe y lo
administra el familiar, así que canjear un QR nunca edita ni crea un senior.»

**S20** — «El objeto `senior` conserva los campos que la app publicada ya consume (`toPublicUser`) y
suma `linkStatus` y `timezone`. No pierde campos: se agregó, no se reemplazó.»

**S21** — «Límite de intentos del canje: HU-009», tomado del contrato con S7: «con un token de 32
bytes el espacio de búsqueda deja de ser el problema (…) así que el límite queda como defensa en
profundidad».

**S22** — De `pairing-generator §5`: «El reclamo va **antes** de escribir el perfil» y «El canje no
crea perfiles y no acepta datos de la ficha: el cuerpo sólo lleva `token`».

**S23** — De `ley-1581` (evidencia en el servidor, no en el cliente): el consentimiento del titular
se registra con los campos que fija esa skill, y el cuerpo del canje no los inventa.

## Decisiones de diseño

- **D1 — Alcance: sólo backend.** La app React Native no existe en el repo (el único `package.json`
  es el del backend), así que S1, S2, S3, S6, S9 y S10 quedan como contrato escrito y marcados
  `cliente`. Nada de lo que se implementa acá depende de ellos.
- **D2 — El canje vive en el mismo slice**: caso de uso `application/RedeemPairingToken.ts`, ruta
  pública en `infrastructure/pairingRoutes.ts` y el resto en `infrastructure/`. No se crea un módulo
  nuevo: el token es el mismo objeto que emite HU-008.
- **D3 — El cuerpo lleva `acceptedTerms` y sin él no hay canje** (`400 TERMS_NOT_ACCEPTED`, el mismo
  patrón, campo y código que ya usa el registro del familiar en `RegisterCaregiver`/`AuthController`).
  Ley 1581 §4 lo exige («si el cliente no envía la bandera de aceptación… el backend debe rechazar la
  solicitud inmediatamente con un HTTP 400») y §1 pide registrar la aceptación «de forma inalterable».
  El «el cuerpo sólo lleva `token`» del contrato se corrige en `docs/pairing-api.md`: su sujeto real
  era que el canje no acepta datos de la ficha (S19), no que no pueda llevar la bandera de
  consentimiento. Sin esta bandera, el servidor estaría fabricando evidencia de una aceptación que
  nadie afirmó.
- **D4 — La evidencia la arma el servidor, no el cliente**: `acceptedTermsAt = clock.now()`,
  `termsVersion` de la config (`TERMS_VERSION`, default `1.0`), `ipAddress` del pedido validado con
  el helper `evidenceIp` que ya usa el registro. Los tres se escriben en la MISMA escritura
  condicional que `linkStatus: 'LINKED'`: o el perfil queda vinculado con evidencia, o no queda nada
  (nunca un vínculo sin consentimiento ni un consentimiento sin vínculo).
- **D5 — Reclamo atómico primero (S16/S18)**: una sola escritura condicional sobre el token
  (`usedAt: null`, `invalidatedAt: null`, `expiresAt` futuro) fija `usedAt`. Si no reclama, se
  distingue con una lectura posterior: sin documento → `404 NOT_FOUND`; `usedAt` presente →
  `409 CONFLICT`; `invalidatedAt` o vencido → `400 VALIDATION_ERROR` genérico. Si reclama y después
  la escritura del perfil **lanza**, responde `500` y el token queda quemado: falla cerrada, el
  familiar emite otro QR. Si la escritura no lanza pero no matchea la condición (el perfil se borró
  entre el reclamo y el vínculo, o otro pedido vinculó primero), responde el mismo `409 CONFLICT`
  genérico de S16: no fue un error del servidor, fue la carrera perdida. En los tres casos el token
  queda usado (S18).
- **D6 — Validación previa al reclamo (S17)**: el perfil se resuelve con el repositorio de seniors
  (`findSeniorForCaregiver(seniorId, token.caregiverId)`), así participa la única fuente de verdad de
  vínculos. Perfil inexistente o ajeno → `409 CONFLICT` genérico, idéntico al de un token ya
  consumido, para no confirmar que el id existe. Perfil ya vinculado → `409 SENIOR_ALREADY_LINKED`
  **sin quemar** el token.
- **D7 — La transición `PENDING → LINKED` la escribe el slice pairing**, con un adaptador propio
  (`MongoosePairingSeniorWriter`) cuyo filtro incluye `linkStatus: 'PENDING'`: además de dejar la
  evidencia de D4, la condición evita el doble vínculo aunque dos canjes ganen carreras distintas.
  El slice seniors no se toca: su mapeo y su contrato visible (`docs/seniors-api.md`) siguen igual.
- **D8 — Bloqueo por perfil persistido (S7)**, con la forma del bloqueo de login: contador y fecha en
  el documento del adulto mayor, contados por el adaptador en una escritura atómica, no en memoria.
  Umbral `REDEEM_MAX_ATTEMPTS` (5) y ventana `REDEEM_LOCKOUT_MINUTES` (15). Respuesta
  `429 ACCOUNT_LOCKED` con `details.retryAfterSeconds`; la fila del catálogo se amplía para nombrar
  el canje.
- **D9 — Throttle por IP en memoria** (`RedeemIpThrottle`, copiando `LoginIpThrottle`): cuenta todos
  los intentos, incluidos los de token desconocido, para que el endpoint no sea un oráculo; ventana
  móvil con reloj inyectado, claves normalizadas, tope y poda, `429 TOO_MANY_REQUESTS` con
  `retryAfterSeconds`. Se documenta que es por proceso, como el resto de los throttles del repo.
- **D10 — La sesión la firma el módulo auth**: el slice pairing recibe el `SessionTokenPort` y arma
  los claims con `sessionClaims` (`sub`, `email`, `role`, `sv` desde el documento). No se duplica ni
  la firma ni el formato del JWT.
- **D11 — Proyección de la respuesta**: el lector del perfil se extiende con `email`, `phone` y
  `emailVerifiedAt` para poder devolver el objeto de S13 (`emailVerified` es `emailVerifiedAt !==
  null`), y `caregiverId` sale del token. El objeto `senior` lleva exactamente esos campos, ni uno
  más (nada de ficha médica: S19).
- **D12 — Mensajes**: en inglés los tres de S15 (los consume la app y no se muestran en el panel) y
  en español `SENIOR_ALREADY_LINKED`; todos en `application/pairingMessages.ts`.
- **D13 — Config nueva**: `REDEEM_MAX_ATTEMPTS`, `REDEEM_LOCKOUT_MINUTES`, `REDEEM_IP_MAX_ATTEMPTS`,
  `REDEEM_IP_WINDOW_MINUTES` por `readPositiveInt`, con sus defaults; `TERMS_VERSION` ya existe en
  `env.ts` y se reusa. Se declaran en `backend/env.sample` y en el `env.sample` de la raíz.

- **D14 — El bloqueo del canje no puede convertirse en una negación de servicio sobre el adulto
  mayor** (hallazgo de la verificación independiente, L6). Con el contador contando cualquier
  credencial inservible, quien tenga un QR ya usado o vencido —una foto, un chat, una captura—
  bloqueaba 15 minutos la vinculación de ese perfil sin ninguna credencial, y repitiéndolo cada 15
  minutos la negaba indefinidamente, mientras el QR nuevo del familiar respondía 429 sin quemarse.
  Dos correcciones, ninguna afloja S7:
  1. **Emitir un QR nuevo reinicia el bloqueo de ese perfil.** Emitir es el acto deliberado del
     familiar que ya estaba documentado como la salida («el familiar emite otro QR»): si lo hace, la
     racha y el `lockedUntil` se limpian en la misma operación de emisión. El camino legítimo
     siempre existe y no depende de esperar 15 minutos.
  2. **Un token ya canjeado no cuenta como fallo**, sólo los inservibles por vencimiento o
     invalidación: un doble toque en el botón de escanear no puede dejar al adulto mayor sin poder
     vincularse. El 409 de un token usado sigue siendo el mismo 409 genérico.
  El límite por IP sigue siendo el freno de fondo, y el bloqueo por perfil conserva su umbral y su
  ventana (S7). Se pinea con tests propios y con los cuatro pines de regresión que dejó la
  verificación (carrera de 8 reclamaciones, carrera de 8 vínculos, indistinguibilidad usado/ajeno y
  bloqueo con limpieza posterior).

- **D15 — Un canje completado no puede dejar al perfil sin salida** (corrección pedida por la
  revisión nativa sobre el hallazgo `R4-1`, CRITICAL e introducido por D14.1). Si el vínculo se
  escribió y la respuesta no llegó —conexión caída, app cerrada, o el fallo de `clearRedeemFailures`
  justo después de la escritura irreversible—, el reintento del teléfono recibía el 409 genérico, el
  perfil quedaba `LINKED` sin sesión y la emisión de un QR nuevo no puede servir porque sólo atiende
  perfiles `PENDING`: recuperarlo exigía tocar la base a mano. Tres cambios, ninguno afloja el uso
  único:
  1. La sesión se firma **antes** de la escritura irreversible (es pura, no puede fallar después).
  2. Limpiar la racha tras un canje exitoso es **best-effort**: su fallo no convierte un canje
     completado en error.
  3. **Replay de recuperación acotado**: un token ya usado, cuyo perfil está `LINKED` y sigue siendo
     del mismo familiar, dentro de `REDEEM_RECOVERY_MINUTES` (15) desde `usedAt`, vuelve a responder
     `201` con una sesión nueva. No crea vínculo, no escribe evidencia, no toca contadores: sólo
     vuelve a firmar lo que el titular ya ganó. Fuera de la ventana se mantiene el `409` genérico, y
     el throttle por IP y el bloqueo por perfil siguen aplicando al reintento.
  La ventana acota la exposición: quien fotografió el QR ya podía canjearlo primero, y ahora puede
  repetirlo durante 15 minutos; pasado ese plazo, no.

## Tasks

- **T1** · S14-S17, S22 · inline · dominio: mensajes del canje y las reglas de estado del token
  (reclamable, vencido, invalidado, usado) como funciones puras; tests primero.
- **T2** · S5, S7-S8, S16-S18 · inline · persistencia: `findByTokenHash` + `claimUnused` (escritura
  condicional), bloqueo por perfil (`registerRedeemFailure`, `clearRedeemFailures`, lectura del
  bloqueo) y `markLinked` con la evidencia de D4 en el mismo update; dobles y pines contra Mongo real
  (`chk-*`).
- **T3** · S4-S5, S8, S16-S19 · inline · aplicación: `RedeemPairingToken` con el orden de D5-D6, el
  bloqueo de D8, el throttle de D9 y la sesión de D10; errores de S14.
- **T4** · S11-S13 · inline · HTTP: ruta pública `POST /api/pairing/redeem`, cuerpo
  `{ token, acceptedTerms }`, `evidenceIp`, respuesta 201 exacta de S13, montaje en el router y
  composición en `server.ts` con la config de D13.
- **T5** · docs · `docs/pairing-api.md` (cuerpo con `acceptedTerms`, 429, remisión a la evidencia),
  `docs/error-handling.md` (filas nuevas y la de `ACCOUNT_LOCKED`), `docs/seniors-api.md` (quién
  escribe `LINKED`), skill `pairing-link` (parte backend) y los dos `env.sample`.
- **T6** · checks · `npm run typecheck`, `npm test` con y sin `MONGO_URL`, `npm run build`,
  verificación independiente (**Risk: items 1 y 2**) y revisión nativa.

## Log

- **L1** — Pedido del humano, textual: «dale con la siguiente HU y te doy todos lo permisos y al
  final dame las cosa que tengo que rprobar y configurar yo tanto en local como en prod».
- **L2** — Mapa de evidencia (explorador, read-only): no existe `toPublicUser` en el rewrite (el
  objeto de S13 se arma desde el documento del perfil más el token); ningún método de
  `SeniorRepositoryPort` escribe `linkStatus`; el bloqueo de login se cuenta en el adaptador con un
  pipeline atómico (`MongooseUserRepository.ts:238-284`) y las reglas puras viven en
  `domain/loginLockout.ts`; la sesión la firma `JwtTokenService` con `sessionClaims`; los throttles
  son `Map` en memoria por proceso; `evidenceIp` valida con `node:net`; la skill `ley-1581` §4 exige
  `400` cuando falta la bandera de aceptación; el único `package.json` es el del backend, así que no
  hay app React Native.
- **L3** — Consulta y decisión sobre el consentimiento: se pidió recomendación y se ejecutó la opción
  B (`{ token, acceptedTerms }` con `400 TERMS_NOT_ACCEPTED`). Razones registradas: la skill
  `ley-1581` §4 la exige para la vinculación, sin bandera el servidor fabricaría evidencia de una
  aceptación que nadie afirmó, el registro del familiar ya la exige (misma asimetría al revés), y es
  más barata porque reusa campo, código, mensaje y helper de IP. El «el cuerpo sólo lleva `token`»
  se corrigió en el contrato, la skill `pairing-generator` §5 y el doc de feature: su sujeto era
  «no acepta datos de la ficha».
- **L4** — Implementación (test-first, delegada) en dos unidades: `d09df8f` (dominio del estado del
  token, puertos, reclamación condicional, escritura de `LINKED` + evidencia, bloqueo por perfil,
  traslado de `evidenceIp` a `shared/domain`, campos del modelo y pines contra Mongo: 948 líneas) y
  `8b4581a` (caso de uso `RedeemPairingToken`, ruta pública, composición de la sesión, config
  `REDEEM_*`, contrato, catálogo de errores, `seniors-api`, skills y los dos `env.sample`: 1677
  líneas). Ambos pasan el slice de ~400 líneas; se registran acá y la entrega se decide al publicar.
- **L5** — Rojo→verde observado: los dos archivos de test nuevos fallaron primero por módulo
  inexistente (197 tests, 2 fail) y quedaron en verde sin tocar ningún test previo. Checks del
  padre: `typecheck` y `build` verdes; `npm test` **205 pass + 27 skipped** sin base y **232/232**
  con Mongo real. Diferencial contra el commit base en la copia temporal: registro, `trustProxy`,
  `seniorsApi` y los pines de Mongo sin cambios de comportamiento.
- **L6** — Verificación independiente (`Risk: items 1 y 2`), segunda corrida: la primera se colgó 30
  minutos en un `bash` y no produjo reporte; se relanzó con sondas acotadas por `timeout`. Resultado:
  **PASS en S4, S5, S7, S8, S11-S23**, con S1-S3, S6, S9 y S10 fuera de alcance por ser de la app.
  Evidencia fuerte: 8 reclamaciones simultáneas contra Mongo real → un solo ganador; 8 vínculos
  simultáneos → un solo `LINKED` con la evidencia escrita una vez; evidencia inyectada desde el
  cuerpo ignorada (se guardan reloj, `TERMS_VERSION` e IP reales); token usado y perfil ajeno con
  respuesta byte-idéntica; bloqueo 429 en el quinto fallo con `retryAfterSeconds=900`, otro perfil
  intacto y limpieza tras el éxito; token quemado en los tres modos de falla posterior al reclamo.
  Sin CRITICAL ni MAJOR. Cuatro NOTEs: el 409 de una condición no cumplida en vez del 500 de D5 (se
  ajustó la redacción), la carrera perdida contaba como fallo del perfil y el bloqueo no tenía
  escape por emisión (los dos juntos permitían negar la vinculación de un adulto mayor a quien
  tuviera un QR usado: **D14**), y que un cliente que reintente un 400 puede autobloquearse.
