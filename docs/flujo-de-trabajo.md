# Flujo de trabajo

Este documento es el contrato operativo del proyecto: cómo se ramifica, cómo se prueba, cómo se
integra y qué está prohibido. **No define requisitos** — para eso está `docs/backlog.md`, que es la
fuente de verdad de las 30 HU. Si algo de acá choca con el backlog o con el anteproyecto, gana el
requisito y este archivo se corrige.

## 0. Antes de escribir una sola línea

Una sesión nueva, en este orden y sin saltear pasos:

1. Leer `AGENTS.md` (estado del repo y stack).
2. Leer `docs/backlog.md`: la HU que vas a tocar **y** las decisiones `L1`–`L9` del encabezado.
3. Leer las skills que esa HU nombra en su línea `**Skills:**`, desde `.agents/skills/project/`.
4. Leer el contrato HTTP que corresponda en `docs/`.
5. Recién entonces, rama.

Si la HU no tiene criterio para algo que necesitás decidir, **no lo inventes**: se agrega el criterio
con el humano y se registra como decisión. Una HU sin criterio verificable no se implementa.

## 1. Punto de partida del rewrite

- El código no existe: el commit `b3a6b0a` dejó solo despliegue, schema de datos, contratos y skills.
- **La aplicación no compila** hasta que existan `backend/package.json`, `backend/src/` y el proyecto
  React Native.
- El código anterior es **consulta, no base**: `git show 25672da:backend/src/...`. No se restaura.
- Mientras no compile, **ningún push a `prod`**: el workflow dispara `docker compose up --build` y
  rompería el deploy.

## 2. Ramas

- Toda tarea vive en su propia rama, creada desde `main`.
- Nombres:
  - HU del backlog: `hu-00X-<slug-corto>` (ej. `hu-001-registro-familiar`).
  - Corrección o tarea técnica: `fix/<slug-corto>` o `feat/<slug-corto>`.
  - Configuración o documentación: `chore/<slug-corto>`.
- Si la rama ya existe, se retoma; no se crea otra.
- **Prohibido** commitear directo en `main` o en `prod`.
- Las ramas heredadas (`dev`, `dev-kevin`, `dev-victor-pinto`) apuntan al árbol viejo y no se usan
  para el rewrite.

## 3. Pruebas antes de integrar

Nada se integra sin esto en verde, y con la salida real a la vista, no con "debería andar":

1. `cd backend && npm test` sin fallos (`node --test`, sin Jest ni Mocha).
2. `cd backend && npm run typecheck` sin errores.
3. `cd app && npm run typecheck && npm run lint` cuando exista el proyecto React Native.
4. Los criterios de aceptación de la HU, **uno por uno**, verificados de forma observable.
5. Si el cambio toca despliegue, datos o un contrato que otros consumen: el chequeo diferencial o la
   verificación independiente que corresponda.

Un criterio no verificado no es un criterio cumplido. Un test que pasa porque el caso no se ejercitó
tampoco cuenta.

## 4. Integración

- Con las pruebas en verde, la rama se integra por merge a `main`.
- Si hay conflictos, se resuelven **en la rama de la tarea**, se vuelven a correr las pruebas y
  después se reintenta el merge.
- Desde `main` no se publica: es la rama de integración, no la de producción.

## 5. Promoción a producción

- `prod` es producción: un push dispara `.github/workflows/prod.yml`, que entra por SSH al VPS y corre
  `docker compose up -d --build`. No hay paso intermedio de revisión.
- Solo se promueve desde `main` ya integrado y verificado, con las pruebas corridas **de nuevo** sobre
  el resultado del merge.
- **El push a `prod` lo confirma el humano antes de ejecutarlo.** El agente no lo hace por iniciativa.
- Si una prueba falla, no hay promoción: se corrige en la rama de la tarea.

## 6. Base de datos de trabajo

- La base de los contenedores es la del VPS y es la fuente de verdad única.
- Toda prueba que escriba datos usa un prefijo identificable (`chk-`, `e2e-`, `smoke-`) y los borra al
  terminar.
- **Nunca** contra la base desplegada: borrados masivos, `db.dropDatabase()`, `deleteMany({})`, ni
  cambios de esquema destructivos.

## 7. Commits

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), en inglés.
- Unidades de trabajo revisables de ~400 líneas cambiadas; si una unidad supera eso, se parte en
  commits encadenados donde cada uno se sostiene solo.
- Los tests y la documentación van **en el mismo commit** que el comportamiento que cubren.
- Una unidad cuya línea `Risk:` nombre un ítem de alto riesgo va en su propio commit, para que la
  revisión la pueda tomar sola.
- Nunca se commitea un secreto: `.env` está ignorado y `.env.example` no lleva valores reales.

## 8. Cierre de cada tarea

Se reporta, sin maquillar:

- qué quedó hecho y con qué evidencia;
- qué se verificó y qué no se pudo verificar;
- `Risk: item N (motivo)` o `Risk: none`, según la lista de alto riesgo;
- el siguiente paso concreto.

## 9. Reglas duras (las que ya rompieron algo una vez)

| Regla | Por qué |
| --- | --- |
| No reintroducir **PIN** ni credenciales para el adulto mayor | Decisión `L3`: el anteproyecto las prohíbe |
| No reintroducir **Prisma** | Prisma 7 no tiene conector MongoDB y nunca lo tendrá |
| No reintroducir **Capacitor** ni una app web | El stack es React Native con dos APK (`L2`) |
| No renumerar HU por iniciativa propia | La numeración del anteproyecto es el contrato de trazabilidad |
| No cambiar los criterios de aceptación sin registrar la decisión | Sin criterio verificable no hay verificación |
| Un perfil ajeno responde **404**, nunca 403 | Un 403 confirma que el id existe |
| Los tokens se guardan hasheados; el valor en claro solo en correo o QR | Fuga de credencial en logs o base |
| El canal en tiempo real exige autenticación | Ya hubo un canal sin auth que filtraba alertas SOS entre cuidadores |

## 10. Revisión nativa (RDD), cuando toque

El gate revisa **la rama completa contra `main`**, no el commit de turno. Tres cosas que cuestan un
intento fallido cada una si no se saben:

- Para revisar un tramo más chico hay que pasar `baseRef` explícito **con el SHA completo de 40
  caracteres**; un SHA abreviado se rechaza con `base-ref-unresolvable`.
- Las lentes se validan contra lo que el proveedor considera pertinente: si una no aplica, la rechaza
  con `lenses-invalid`. Elegí por consecuencia, no por costumbre.
- Una candidata enorme agota el presupuesto de contexto del revisor y no hay forma de aprobarla:
  conviene commitear en tramos desde el principio.

Los hallazgos no bloqueantes se corrigen en un commit posterior, nunca re-ejecutando la revisión de la
misma candidata.

## 11. Registrar una decisión nueva

Toda decisión que cambie un requisito, un criterio o el stack se registra:

1. en `docs/backlog.md`, en la lista `L#` del encabezado, con el motivo; y
2. en el `## Log` de la HU afectada, con las palabras exactas de quien la tomó.

Una decisión que no quedó escrita no existe: la próxima sesión va a "corregir" lo que no sabía.
