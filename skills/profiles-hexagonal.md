# Reglas del slice de perfiles (seniors) — HU-005

Cómo se modela y se toca el perfil del adulto mayor. Se lee antes de escribir código en
`backend/src/modules/seniors/` o en cualquier cosa que lea un perfil.

## 1. Un senior es un `User`, y se crea por una sola fábrica

- `User.createSenior` es el único constructor. El alta del panel (`CreateSeniorProfile`) y el
  canje de código (`LinkSeniorApp`) lo usan los dos: si mañana cambia una regla del alta, cambia
  para los dos caminos a la vez.
- El senior no tiene correo propio ni contraseña: lleva un correo sintético
  `senior+<uuid12>@seniors.local` para que el índice único siga siendo honesto, y `passwordHash`
  queda `null`.
- `caregiverId` es obligatorio y **nunca** viene del cuerpo del pedido: el controlador lo toma de
  `req.user.id` y lo pasa como parámetro al caso de uso.

## 2. El estado de vinculación es parte del dato, no de la vista

- `PENDING`: el familiar cargó el perfil y el teléfono todavía no lo reclamó.
- `LINKED`: el teléfono canjeó un código, o el documento es anterior a HU-005 (el canje era el
  único camino de alta, así que la ausencia del campo significa vinculado).
- Solo el canje de código pasa un perfil a `LINKED`. El panel nunca lo marca a mano.
- Todo listado que alimente una acción real del adulto mayor (actividades, SOS, GPS, selector del
  panel) filtra los `PENDING`. Un perfil pendiente no tiene dispositivo, así que no tiene sentido
  que sea elegible.

## 3. La propiedad del recurso es seguridad, y se resuelve en el caso de uso

- La consulta de lista se acota por `caregiverId` + `role: SENIOR`.
- El detalle compara el dueño contra el `caregiverId` recibido **por parámetro**. El caso de uso
  no conoce `req`.
- Un perfil ajeno responde igual que uno inexistente: `404 SENIOR_NOT_FOUND`. Un `403` confirmaría
  que el id existe.
- El id se valida en forma (24 hex) antes de consultar: un id malformado que llega a Prisma
  termina en `500`, no en el `404` que promete el contrato.

## 4. Proyección pública: la lista blanca manda

- `toPublicSenior` es la única forma en que un perfil sale del backend: `id`, `fullName`,
  `timezone`, `linkStatus`, `createdAt`.
- `pinHash`, el correo sintético y cualquier campo de sesión **no** se proyectan. Si alguien
  necesita un campo nuevo en la respuesta, se agrega acá y se revisa qué se está exponiendo.
- `toPublicUser` (módulo auth) no se toca para esto: tiene otro contrato y otros consumidores.

## 5. Ley 1581: el titular es el adulto mayor, no el familiar

- El alta del panel deja `acceptedTermsAt` y `termsVersion` en `null`. El familiar administra,
  pero no consiente por el titular.
- El consentimiento se registra cuando el adulto mayor acepta en su app (HU-008), antes de
  compartir actividades, SOS o GPS.
- Consecuencia implementada: un perfil `PENDING` sin consentimiento no es elegible para
  recolección de datos. Si alguna HU futura necesita recolectar antes de vincular, tiene que
  resolver el consentimiento primero, no saltearlo.

## 6. Lectura del perfil y del vínculo

- `GET /api/seniors` lista todos los perfiles del familiar; `GET /api/pairing/seniors` lista solo
  los vinculados porque alimenta el selector de actividades. No son intercambiables.
- El contrato HTTP completo está en `docs/seniors-api.md`.

## 7. Estructura del slice

```
modules/seniors/
  domain/seniorProfile.js        reglas puras: PIN, zona horaria, nombre, proyección pública
  application/CreateSeniorProfile.js
  application/ListSeniorProfiles.js
  application/GetSeniorProfile.js
  infrastructure/SeniorProfileController.js   HTTP: status y traducción de req
  infrastructure/seniorRoutes.js              authMiddleware + requireRole(CAREGIVER)
  index.js                                    composición; reusa el userRepository de auth
```

No se declara un repositorio propio: el senior vive en la colección `User` y el adaptador de auth
ya la expone. Un segundo adaptador sobre la misma colección es la forma más rápida de que dos
reglas de escritura convivan sin que nadie lo note.
