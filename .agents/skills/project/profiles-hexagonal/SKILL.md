---
name: profiles-hexagonal
description: Reglas del slice seniors: createSenior como única fábrica, propiedad resuelta por la colección de vínculos seniorlinks (sin caregiverId en el perfil), ficha médica en su ruta propia, guard requireRole. Usar en HU-005, HU-007, HU-011 y HU-012.
---

# Reglas del slice de perfiles (seniors) — HU-005/HU-007

Cómo se modela y se toca el perfil del adulto mayor. Se lee antes de escribir código en
`backend/src/modules/seniors/` o en cualquier cosa que lea un perfil o un vínculo. Describe el
código tal como está escrito (código `backend/src/modules/seniors/`, `backend/src/shared/models/`,
`backend/src/shared/middlewares/requireRole.ts`).

## 1. Un senior es un `User`, y se crea por una sola fábrica

- La única fábrica es **`createSenior`**, en `backend/src/modules/seniors/domain/seniorProfile.ts`
  (D7). El alta del panel (`CreateSeniorProfile`) y el canje del dispositivo la usan los dos: si
  mañana cambia una regla del alta, cambia para los dos caminos a la vez. El documento sigue
  siendo un `User` con `role: 'SENIOR'`: no existe una colección aparte de perfiles.
- El senior no tiene correo propio ni contraseña: lleva un correo sintético
  `senior+<uuid12>@seniors.local` para que el índice único siga siendo honesto, y `passwordHash`
  queda `null` (S15).
- **No hay PIN** ni `pinHash` (S8). El documento tampoco lleva `caregiverId`: la propiedad vive en
  los vínculos. Quien reintroduzca cualquiera de los dos campos reabre una decisión ya cerrada.
- El `caregiverId` que alimenta el alta **nunca** viene del cuerpo del pedido: el controlador lo
  toma de la sesión y se lo pasa como parámetro al caso de uso (S14).

## 2. La propiedad vive en la colección de vínculos

- La fuente única de propiedad es la colección `seniorlinks`
  (`backend/src/shared/models/SeniorLink.ts`): `{ seniorId, caregiverId, role, status, invitedBy,
  createdAt }` con índice único compuesto `(seniorId, caregiverId)` (D1). Un perfil sin vínculo
  no le pertenece a nadie.
- Un adulto mayor admite **N familiares `ACTIVE` simultáneos**, con permisos equivalentes: ningún
  `OWNER` manda más que un `FAMILY`, y nadie queda en solo lectura (S1/S2). El `role`
  (`OWNER`/`FAMILY`) es informativo, no cambia comportamiento.
- Agregar un familiar es idempotente y no toca los vínculos existentes (S3): entra como `FAMILY`
  y el índice único impide duplicar a la misma persona.
- Revocar es **desactivar, nunca borrar**: el `status` pasa a `REVOKED` y el registro queda.
- **Un vínculo inactivo no autoriza** (D2). Toda lectura del slice exige vínculo `ACTIVE`: la
  lista, el detalle, la ficha médica y el listado de familiares consultan por el puerto, que
  autoriza contra `seniorlinks` en la consulta.

## 3. La propiedad del recurso es seguridad, y se resuelve en el caso de uso

- `loadAccessibleSenior` (`modules/seniors/application/loadAccessibleSenior.ts`) es el camino
  canónico: valida el `id` en forma (24 hex, `isObjectIdHex`) **antes** de tocar el repositorio —
  un id malformado que llegara al driver terminaría en `500`, no en el `404` prometido — y pide el
  perfil autorizado por vínculo al puerto.
- El caso de uso recibe ambos ids **por parámetro** y nunca conoce `req` ni el body.
- Ajeno, inexistente, mal formado y el `id` de un `CAREGIVER` responden todos el mismo
  `404 SENIOR_NOT_FOUND` («No encontramos ese perfil», sin `details`). Un `403` confirmaría que
  el id existe (S19).

## 4. Proyecciones: la lista blanca manda, y la ficha médica tiene ruta propia

- `toPublicSenior` es la única forma en que un perfil sale del backend por la vista pública:
  `id`, `fullName`, `timezone`, `linkStatus`, `createdAt`. La respuesta exacta del alta es
  precisamente esa proyección (S22). El correo sintético, la ficha médica y el consentimiento no
  se proyectan jamás por acá.
- La ficha médica es la **otra** vista: `toSeniorMedicalRecord` expone `bloodType`, `allergies`,
  `conditions`, `medications` y `emergencyContact`, y se lee por su ruta
  `GET /api/seniors/:id/medical` (D3). Mantener la ruta separada es lo que hace observable la
  regla S11: el detalle público queda exactamente igual al objeto del alta, y cualquier cosa
  sensible sale por una proyección controlada.
- Consecuencia de mantener la fila: si alguien necesita un campo nuevo en el objeto público, se
  agrega a la proyección y se revisa qué se está exponiendo.
- `toPublicUser` (módulo auth) no se toca para esto: tiene otro contrato y otros consumidores.

## 5. La ficha médica se valida antes de escribir

- Validación de negocio en el caso de uso `CreateSeniorProfile`, un código por campo (S16/D8):
  `INVALID_NAME`, `INVALID_TIMEZONE`, `INVALID_BLOOD_TYPE`, `INVALID_ALLERGIES`,
  `INVALID_CONDITIONS`, `INVALID_MEDICATIONS`, `INVALID_EMERGENCY_CONTACT` — todos `400`, para que
  la pantalla marque dónde está el problema. Un campo con la forma equivocada (una lista que no es
  array, un contacto que no es objeto) es `INVALID_BODY` con `details.field` y lo traduce el
  controlador, que solo decide forma, no reglas.
- `bloodType` es obligatorio y de enumeración cerrada (`A+ A- B+ B- AB+ AB- O+ O-`).
- Las tres listas son opcionales: máximo 20 ítems de 1 a 80 caracteres cada uno.
- El contacto de emergencia necesita nombre de 3 a 120 caracteres y teléfono de 6 a 20 con `+`,
  dígitos, espacios o guiones.
- El nombre va de 3 a 120 caracteres tras normalizar (colapso de espacios).
- `timezone` es opcional: si falta, viene vacía o `null`, se guarda `America/Bogota` (S17). Una
  zona con contenido se valida contra una base IANA y una inventada **no** se cae a Bogotá en
  silencio: se rechaza con `INVALID_TIMEZONE`.

## 6. Ley 1581: el titular es el adulto mayor, no el familiar

- El alta del panel deja `acceptedTermsAt` y `termsVersion` en `null`. El familiar administra,
  pero no consiente por el titular.
- El consentimiento se registra cuando el adulto mayor acepta en su app (HU-009), antes de
  compartir actividades, SOS o GPS.
- Consecuencia implementada: un perfil `PENDING` sin consentimiento no es elegible para
  recolección de datos. Si alguna HU futura necesita recolectar antes de vincular, tiene que
  resolver el consentimiento primero, no saltearlo.

## 7. Estructura del slice

```
backend/src/modules/seniors/
  domain/seniorProfile.ts          fábrica createSenior, validación de la ficha, zona horaria,
  │                                proyecciones toPublicSenior / toSeniorMedicalRecord
  domain/seniorLink.ts             reglas del vínculo: createOwnerLink / createFamilyLink,
  │                                isActiveLink, canCaregiverAccessSenior, isObjectIdHex
  application/CreateSeniorProfile.ts
  application/ListSeniorProfiles.ts
  application/GetSeniorProfile.ts
  application/GetSeniorMedicalRecord.ts
  application/ListSeniorCaregivers.ts
  application/loadAccessibleSenior.ts   el 404 canónico: id en forma + vínculo activo
  application/SeniorRepositoryPort.ts   puerto: alta (perfil + vínculo), listar, buscar
  │                                     autorizando, addCaregiverLink, listCaregiversOfSenior
  infrastructure/MongooseSeniorRepository.ts   adaptador sobre `users` y `seniorlinks`
  infrastructure/SeniorController.ts          HTTP: forma del cuerpo, status y traducción de req
  infrastructure/seniorRoutes.ts              requireSession + requireRole('CAREGIVER') en las 5 rutas
  index.ts                         composición del módulo; monta el router en /api/seniors
```

- El documento del perfil vive en `backend/src/shared/models/User.ts` (con la ficha médica como
  subdocumento) y el vínculo en `backend/src/shared/models/SeniorLink.ts`. El guard de rol,
  `requireRole` (D5), es compartido: `backend/src/shared/middlewares/requireRole.ts`.
- **Repositorio propio del slice** (D6): `SeniorRepositoryPort` + `MongooseSeniorRepository`.
  Antes no se declaraba repositorio porque el senior era solo un `User`; ahora los vínculos son
  **otra colección** (`seniorlinks`) que el adaptador de auth no expone, y la propiedad se
  resuelve con dos consultas coordinadas por el puerto. Un segundo adaptador sobre la **misma**
  colección (`users`) sigue prohibido: es la forma más rápida de que dos reglas de escritura
  convivan sin que nadie lo note.
- Todas las rutas llevan los dos guards, sesión primero: sin token `401 UNAUTHORIZED`, con sesión
  de otro rol `403 FORBIDDEN` (S20). El contrato HTTP completo está en `docs/seniors-api.md`; los
  errores, en `docs/error-handling.md`.
- Hoy la única escritura de vínculos por HTTP es el alta (vínculo `OWNER`). La invitación de otro
  familiar con token propio (HU-011) no tiene contrato todavía: el dominio ya la modela
  (`createFamilyLink`) y el puerto ya sabe escribirla de forma idempotente sin revocar a nadie.
