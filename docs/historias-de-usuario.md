# Historias de Usuario — Plataforma de Acompañamiento para Adultos Mayores

**Producto:** aplicación de acompañamiento para adultos mayores con recordatorios de dosificaciones indicadas por un médico, cargadas por un encargado.
**Alcance de este documento:** funcionalidad observada y verificada en la sesión de desarrollo del 13 de noviembre de 2025 (rama `dev-kevin`, carpeta `mobile-app/`).
**Criterio de orden:** las historias están numeradas en el orden en que deben desarrollarse, no en el orden en que se descubrieron.

## Cómo se ordenó el backlog

El orden responde a tres reglas aplicadas en este orden de prelación:

1. **Dependencia técnica primero.** Ninguna historia aparece antes de aquello que necesita para existir: no hay módulos de datos sin base de datos conectada, no hay base de datos conectada sin base de datos creada, no hay filtrado por vínculo sin vinculación.
2. **Riesgo de retrabajo.** Se adelanta lo que, si se deja para el final, obliga a rehacer trabajo ya hecho. Por eso la capa de datos contra la base externa va antes que los módulos CRUD (hacerlos primero sobre almacenamiento local implicaría reescribir los cuatro).
3. **Valor para el usuario antes que presentación.** El núcleo del cuidado (dosificación, citas, alertas, tareas) precede a la vitrina (landing, botón de acceso) y al soporte de pruebas (usuarios demo, contenidos).

Escala de prioridad usada:

| Prioridad | Significado |
| --- | --- |
| **P0** | Bloqueante: sin esto no existe producto, ni datos persistentes, ni acceso seguro. |
| **P1** | Núcleo: funcionalidad central del acompañamiento. |
| **P2** | Soporte: facilita el uso, las pruebas o la comunicación, pero el producto funciona sin ello. |
| **P3** | Cierre: depende de una decisión externa o de material provisto por terceros. |

Estados: `Implementada` (código y pruebas existentes), `Pendiente de validación` (código listo, falta prueba en dispositivo real), `Pendiente` (no implementada). Varias historias ya están implementadas sobre almacenamiento local; su posición en la secuencia indica dónde corresponden en un desarrollo desde cero y qué falta para que la versión definitiva exista.

### Secuencia de desarrollo

| Fase | Foco | Historias |
| --- | --- | --- |
| 1 | Fundaciones de datos | HU-01, HU-02 |
| 2 | Identidad, acceso y reglas de visibilidad | HU-03 a HU-08 |
| 3 | Capa de datos contra la base externa | HU-09 |
| 4 | Núcleo funcional del cuidado | HU-10 a HU-14 |
| 5 | Vinculación familiar | HU-15 a HU-18 |
| 6 | Entrada y presentación | HU-19, HU-20 |
| 7 | Soporte de pruebas y cierre de contenido | HU-21, HU-22 |

## Parámetros de arquitectura (restricciones del proyecto)

Estos parámetros son decisiones de diseño ya tomadas y condicionan todas las historias; ninguna solución puede contradecirlos.

| Parámetro | Definición |
| --- | --- |
| **P1 — Base de datos externa independiente** | La información del sistema reside en una base de datos propia, externa a la aplicación, con la que el sistema se comunica a través de su capa de servicios. La base de datos no forma parte del cliente: la aplicación no la embebe ni la replica como fuente de verdad. Su aprovisionamiento y su conexión se gestionan como historias de usuario propias (HU-01 y HU-02). |
| **P2 — Persistencia local no es la fuente de verdad** | El almacenamiento del dispositivo se admite solo como caché o como apoyo de desarrollo, nunca como repositorio definitivo de los datos del adulto mayor. |
| **P3 — Contrato único de acceso a datos** | Web y móvil consumen el mismo contrato de servicios; el detalle de la base de datos queda encapsulado del lado del servidor y no se expone al cliente. |
| **P4 — Sin acceso directo del cliente a la base** | Ningún cliente abre conexiones a la base de datos: toda lectura y escritura pasa por la API del backend, que aplica validación y control de acceso. |

## Actores del sistema

| Actor | Descripción | Persona de referencia |
| --- | --- | --- |
| Encargado / cuidador | Persona capacitada que administra la información y la agenda | `prueba@aam.demo` |
| Adulto mayor | Usuario final con interfaz simplificada y tipografía grande | Don José Pérez (`adulto@aam.demo`) |
| Familiar | Persona que se vincula al adulto mayor mediante código QR | María (`familiar@aam.demo`) |
| Administrador | Super usuario con acceso total y rol no modificable | `admin@aam.demo` |

---

# Fase 1 — Fundaciones de datos

Sin base de datos creada y conectada no hay dónde persistir nada, y todo lo demás se construiría sobre almacenamiento local, que es desechable.

## HU-01 — Crear y aprovisionar la base de datos externa

**Como** responsable técnico del proyecto,
**quiero** crear y aprovisionar una base de datos externa e independiente para la plataforma,
**para** que la información del adulto mayor tenga un repositorio propio, duradero y separado de las aplicaciones cliente.

**Criterios de aceptación**

1. Existe una instancia de base de datos dedicada al proyecto, alojada fuera del cliente web y de la aplicación móvil, alcanzable solo desde el backend.
2. Se define y versiona el esquema de datos de las entidades del sistema: usuarios y roles, dosificaciones, alertas, tareas, citas y vínculos entre familiar y adulto mayor.
3. El esquema se aplica mediante migraciones reproducibles; una instancia nueva se deja operativa solo con ejecutarlas, sin pasos manuales no documentados.
4. El esquema declara las restricciones de integridad necesarias: correo único por usuario, referencias obligatorias al adulto mayor en los registros vinculados y borrado coherente de los datos dependientes.
5. Se crea un usuario de aplicación con permisos mínimos sobre el esquema, distinto del usuario administrador, y no se reutilizan credenciales de otros entornos.
6. Existen entornos separados para desarrollo y producción, y la base de producción no se usa con datos de prueba.
7. El procedimiento de creación y aprovisionamiento queda documentado en el repositorio, incluyendo cómo restaurar una copia de respaldo.

**Prioridad:** P0 · **Estado:** Pendiente · **Depende de:** nada (primer paso del proyecto)

## HU-02 — Conectar el backend con la base de datos externa

**Como** responsable técnico del proyecto,
**quiero** que el backend establezca y administre la conexión con la base de datos externa,
**para** que la aplicación lea y escriba información de forma segura, sin exponer credenciales ni detalles de la base al cliente.

**Criterios de aceptación**

1. La cadena de conexión y las credenciales se leen de variables de entorno del servidor; no existen en el código, en el cliente ni en archivos versionados del repositorio.
2. El repositorio incluye un archivo de ejemplo de variables de entorno con todas las claves necesarias y valores vacíos o de ejemplo.
3. La conexión se establece al iniciar el backend, se reutiliza de forma controlada y se cierra de forma ordenada al detener el proceso.
4. Existe una verificación de salud de la conexión que responde en estado correcto o en falla, y el arranque informa con claridad si la base de datos no está accesible.
5. Los errores de conexión se registran sin exponer credenciales ni cadenas de conexión completas, y producen una respuesta de error controlada en lugar de una caída del servicio.
6. La conexión viaja cifrada y las credenciales pueden rotarse sin cambios de código, solo actualizando las variables de entorno.
7. La aplicación cliente nunca establece conexión directa con la base de datos: todo acceso se resuelve a través de la API del backend (parámetro P4).

**Prioridad:** P0 · **Estado:** Pendiente · **Depende de:** HU-01

---

# Fase 2 — Identidad, acceso y reglas de visibilidad

Todo dato del adulto mayor pertenece a alguien y no debe ser visible para cualquiera. Se resuelve antes de construir los módulos para no rehacerlos después.

## HU-03 — Registrarme como usuario nuevo

**Como** usuario nuevo,
**quiero** crear una cuenta con correo y contraseña,
**para** usar la aplicación con mi propio perfil.

**Criterios de aceptación**

1. El registro exige un correo electrónico válido y no repetido; si el correo ya existe, se muestra un mensaje de error y no se crea la cuenta.
2. La contraseña se almacena cifrada con SHA-256 y sal; nunca en texto plano.
3. Al completar el registro se inicia la sesión y se redirige al panel principal.
4. Un registro iniciado desde el teléfono asigna el rol *familiar* a la nueva cuenta.

**Prioridad:** P0 · **Estado:** Implementada con persistencia local provisional · **Depende de:** HU-01, HU-02 (para la versión definitiva)

## HU-04 — Iniciar sesión

**Como** usuario registrado,
**quiero** autenticarme con mi correo y contraseña,
**para** recuperar mi sesión y mis datos.

**Criterios de aceptación**

1. Credenciales correctas: se abre el panel principal con la sesión activa.
2. Credenciales incorrectas: se muestra un error y no se crea sesión.
3. La sesión persiste después de recargar o reabrir la aplicación.
4. Una sesión iniciada desde el teléfono toma el rol *familiar*, salvo que la cuenta sea administrador.

**Prioridad:** P0 · **Estado:** Implementada · **Depende de:** HU-03

## HU-05 — Cerrar sesión

**Como** usuario autenticado,
**quiero** cerrar sesión de forma explícita,
**para** dejar el dispositivo sin acceso a mis datos.

**Criterios de aceptación**

1. Existe una acción de cierre de sesión en el panel principal.
2. Al cerrarla se borra la sesión y se regresa a la presentación pública.
3. Las pantallas internas dejan de ser accesibles mientras no haya sesión.

**Prioridad:** P1 · **Estado:** Implementada · **Depende de:** HU-04

## HU-06 — Ser protegido contra el acceso sin sesión

**Como** responsable del producto,
**quiero** que las pantallas internas exijan una sesión válida,
**para** evitar que se exponga información del adulto mayor a terceros.

**Criterios de aceptación**

1. Cualquier ruta del panel redirige a la autenticación si no hay sesión activa.
2. Al iniciar sesión correctamente se accede al panel con la sesión ya cargada.
3. En la versión definitiva, la sesión se valida contra el backend y una sesión expirada se trata como ausencia de sesión.

**Prioridad:** P0 · **Estado:** Implementada (local) · **Depende de:** HU-04

## HU-07 — Identificarme con un rol

**Como** usuario,
**quiero** que el sistema identifique mi rol (`administrador`, `adulto_mayor`, `cuidador`, `familiar`),
**para** que se comporte de acuerdo con mis responsabilidades.

**Criterios de aceptación**

1. La sesión almacena el rol del usuario y lo muestra en el panel.
2. En web existe un selector de rol para pruebas; en móvil el rol se fija según el flujo de acceso.
3. El rol *administrador* no puede modificarse desde la interfaz.

**Prioridad:** P0 · **Estado:** Implementada · **Depende de:** HU-04

## HU-08 — Definir la política de roles y la integración con el repositorio del equipo

**Como** equipo de desarrollo,
**quiero** acordar qué ve y qué puede hacer cada rol, y cómo se integra esta aplicación con el `frontend/` existente,
**para** evitar comportamientos contradictorios y decisiones duplicadas.

**Criterios de aceptación**

1. Documento de roles con permisos por pantalla y por operación.
2. Decisión registrada: la aplicación Expo sustituye al `frontend/` o convive con él.
3. Los flujos de acceso y las vistas quedan alineados con la decisión anterior antes de construir las pantallas de datos.

**Prioridad:** P1 · **Estado:** Pendiente (decisión del equipo) · **Depende de:** HU-07

---

# Fase 3 — Capa de datos contra la base externa

Se construye una sola vez, antes de los módulos, para que los cuatro CRUD se apoyen en ella en lugar de implementarse sobre almacenamiento local y reescribirse después.

## HU-09 — Persistir y sincronizar contra la base de datos externa

**Como** usuario,
**quiero** que mis datos y mi sesión vivan en la base de datos externa del sistema,
**para** acceder a la información desde cualquier dispositivo y no perderla al cambiar de teléfono.

**Criterios de aceptación**

1. Autenticación, dosificaciones, alertas, tareas, citas y vínculos se resuelven contra la API del backend, que a su vez opera sobre la base de datos externa independiente; el almacenamiento local deja de ser la fuente de verdad (parámetros P1 y P2).
2. El cliente no abre conexiones directas a la base de datos: toda lectura y escritura pasa por el backend, que valida los datos y aplica el control de acceso (parámetro P4).
3. La capa de servicios conserva el mismo contrato para web y móvil, sin exponer el detalle de la base de datos al cliente (parámetro P3).
4. La aplicación informa con claridad la indisponibilidad del servicio y no presenta datos locales como si fueran los almacenados en la base de datos.
5. Existe manejo explícito de errores de red, de sesión expirada y de reintento de operaciones fallidas.

**Prioridad:** P0 · **Estado:** Pendiente · **Depende de:** HU-01, HU-02, HU-03

---

# Fase 4 — Núcleo funcional del cuidado

El contenedor primero y luego los módulos en orden de valor clínico: qué medicamento tomar, cuándo es la consulta, qué hay que avisar y qué queda pendiente.

## HU-10 — Ver un panel único con los cuatro módulos

**Como** usuario autenticado,
**quiero** un panel principal que reúna dosificación, alertas, tareas y citas,
**para** tener una sola vista operativa del día.

**Criterios de aceptación**

1. El panel presenta cuatro accesos: 💊 Dosificación, 🔔 Alertas, 📝 Tareas y 📅 Citas.
2. Cada acceso navega a su pantalla de gestión.
3. El panel muestra un distintivo con el rol del usuario en sesión.

**Prioridad:** P1 · **Estado:** Implementada · **Depende de:** HU-06, HU-07

## HU-11 — Registrar y administrar dosificaciones

**Como** encargado,
**quiero** registrar las dosificaciones indicadas por el médico,
**para** que el adulto mayor tenga un recordatorio claro de qué medicamento tomar y cuándo.

**Criterios de aceptación**

1. Puedo crear una dosificación con medicamento, dosis, horario (formato 24 h `HH:MM`) y notas.
2. Puedo editar y eliminar dosificaciones existentes; el borrado requiere confirmación en dos pasos.
3. El listado refleja los cambios de inmediato y los conserva tras recargar la aplicación.
4. Los campos obligatorios vacíos impiden guardar el registro.

**Prioridad:** P1 · **Estado:** Implementada (local) · **Depende de:** HU-09, HU-10

## HU-12 — Agendar citas médicas

**Como** encargado,
**quiero** agendar citas con título, médico, lugar, fecha y hora,
**para** que el adulto mayor y su familia conozcan los próximos compromisos médicos.

**Criterios de aceptación**

1. Puedo crear una cita con título, médico, lugar, fecha (`AAAA-MM-DD`) y hora.
2. Las citas creadas aparecen en el listado con sus datos completos.
3. Puedo editar y eliminar citas con confirmación en dos pasos.
4. Los datos persisten entre sesiones.

**Prioridad:** P1 · **Estado:** Implementada (local) · **Depende de:** HU-09, HU-10

## HU-13 — Publicar y consultar alertas

**Como** encargado,
**quiero** publicar alertas con título, mensaje, nivel y fecha,
**para** comunicar avisos relevantes al adulto mayor y su entorno.

**Criterios de aceptación**

1. Puedo crear una alerta con título, mensaje, nivel (*información* o *importante*) y fecha.
2. El nivel se muestra diferenciado visualmente en el listado.
3. Puedo editar y eliminar alertas con la misma mecánica de confirmación.
4. Los datos persisten entre sesiones.

**Prioridad:** P1 · **Estado:** Implementada (local) · **Depende de:** HU-09, HU-10

## HU-14 — Gestionar tareas de cuidado

**Como** encargado,
**quiero** crear tareas de cuidado y marcarlas como completadas,
**para** hacer seguimiento de las actividades pendientes del día.

**Criterios de aceptación**

1. Puedo crear una tarea con título.
2. Puedo marcar y desmarcar una tarea como completada desde el listado.
3. Puedo editar y eliminar tareas; el borrado requiere confirmación.
4. El estado de completado se conserva tras recargar la aplicación.

**Prioridad:** P2 · **Estado:** Implementada (local) · **Depende de:** HU-09, HU-10

---

# Fase 5 — Vinculación familiar

Requiere cuentas con rol (fase 2) y datos ya persistidos (fase 3), porque el vínculo es lo que decide de quién son esos datos.

## HU-15 — Mostrar mi código QR de vinculación

**Como** familiar,
**quiero** ver mi código QR en la aplicación,
**para** entregarlo al adulto mayor o a su cuidador y quedar vinculado.

**Criterios de aceptación**

1. La pantalla *Mi QR* muestra un código QR con el identificador de vinculación del familiar.
2. El identificador se deriva del correo del familiar mediante SHA-256 (16 caracteres hexadecimales) y es verificable sin conexión a red.
3. La pantalla funciona tanto en web como en móvil.
4. El código del familiar de demostración María es `113232101e904ed4`.

**Prioridad:** P1 · **Estado:** Implementada · **Depende de:** HU-07

## HU-16 — Escanear un código QR para vincularme

**Como** adulto mayor o cuidador,
**quiero** escanear el código QR del familiar con la cámara del teléfono,
**para** quedar vinculado a esa persona sin escribir datos.

**Criterios de aceptación**

1. En el teléfono, el escaneo está disponible con la cámara (`expo-camera`).
2. Si no hay sesión, el escaneo crea una sesión con rol *adulto_mayor* y el vínculo registrado.
3. Si ya hay sesión, el rol pasa a *cuidador*, salvo que la cuenta sea administrador.
4. En web no se ofrece la cámara: se muestra el aviso "El escaneo está solo en la aplicación".
5. El acceso al escaneo está disponible desde la presentación pública y desde la pantalla de autenticación.

**Prioridad:** P1 · **Estado:** Implementada, pendiente de validación en dispositivo · **Depende de:** HU-15

## HU-17 — Validar el escaneo en dispositivo físico

**Como** equipo de calidad,
**quiero** probar el escaneo de QR en un teléfono real con Expo Go,
**para** confirmar el comportamiento de ambos flujos (invitado y autenticado).

**Criterios de aceptación**

1. Invitado que escanea un QR válido termina como *adulto_mayor* con el vínculo registrado.
2. Usuario autenticado que escanea un QR válido pasa a *cuidador*.
3. Un QR inválido o ajeno muestra un error y no crea vínculo.
4. Se registra la evidencia de la prueba (capturas y resultado).

**Prioridad:** P1 · **Estado:** Pendiente (cierra HU-16) · **Depende de:** HU-16

## HU-18 — Ver solo la información de mi vínculo

**Como** familiar o cuidador,
**quiero** que el panel muestre únicamente los datos del adulto mayor al que estoy vinculado,
**para** no mezclar información de distintas personas.

**Criterios de aceptación**

1. Dosificación, alertas, tareas y citas se filtran por el vínculo de la sesión.
2. Sin vínculo activo se informa la situación y se ofrece la vinculación por QR.
3. El administrador conserva la vista global.

**Prioridad:** P1 · **Estado:** Pendiente (hoy los datos son globales y locales) · **Depende de:** HU-09, HU-16

---

# Fase 6 — Entrada y presentación

Es la cara del producto, pero no bloquea nada del núcleo: puede construirse en paralelo y refinarse al final. Ambas ya existen como versión provisional.

## HU-19 — Conocer la propuesta del producto

**Como** visitante,
**quiero** acceder a una página de presentación con la visión, la misión y la información del producto,
**para** entender qué ofrece la plataforma antes de registrarme.

**Criterios de aceptación**

1. La página de inicio muestra una barra de navegación con las secciones *Visión*, *Misión* e *Información*.
2. Cada sección presenta contenido legible y textos de marcador de posición reemplazables.
3. La página se adapta a navegador de escritorio y a pantalla de teléfono.
4. En dispositivo móvil se sirve una versión simplificada, con tipografía grande y menos elementos por pantalla.

**Prioridad:** P2 · **Estado:** Implementada (textos provisionales, ver HU-22) · **Depende de:** nada

## HU-20 — Iniciar sesión o registrarme desde la presentación

**Como** visitante,
**quiero** encontrar un botón visible de *Iniciar sesión / Registrarme* en la esquina de la barra de navegación,
**para** llegar al formulario de acceso sin recorrer toda la página.

**Criterios de aceptación**

1. El botón aparece en la esquina de la barra de navegación, tanto en web como en móvil.
2. Al pulsarlo se navega a la pantalla de autenticación (`/auth`).
3. En web el botón es clicable en toda su superficie, sin zonas muertas.

**Prioridad:** P2 · **Estado:** Implementada · **Depende de:** HU-19

---

# Fase 7 — Soporte de pruebas y cierre de contenido

## HU-21 — Contar con usuarios de demostración

**Como** evaluador o integrante del equipo,
**quiero** que el sistema siembre usuarios de demostración en cada arranque,
**para** probar los distintos roles sin crear cuentas manualmente.

**Criterios de aceptación**

1. Se crean, de forma idempotente, las cuentas: `admin@aam.demo` / `admin123` (administrador), `prueba@aam.demo` / `prueba123` (cuidador), `adulto@aam.demo` / `adulto123` (adulto mayor) y `familiar@aam.demo` / `familiar123` (familiar).
2. Reiniciar la aplicación no duplica usuarios ni pisa contraseñas ya existentes.
3. El rol *administrador* no puede ser degradado por ningún flujo de la aplicación.

**Prioridad:** P2 · **Estado:** Implementada · **Depende de:** HU-03, HU-07

## HU-22 — Contar con contenidos definitivos

**Como** responsable del producto,
**quiero** reemplazar los textos provisionales de visión, misión e información,
**para** publicar la propuesta real acordada con el cliente.

**Criterios de aceptación**

1. Los textos de `src/content.ts` contienen la versión aprobada, sin marcadores de posición.
2. La revisión de contenido cubre web y móvil.

**Prioridad:** P3 · **Estado:** Pendiente (depende de definición del cliente) · **Depende de:** HU-19

---

## Matriz de trazabilidad

| Fase | Historias | Estado consolidado |
| --- | --- | --- |
| 1. Fundaciones de datos | HU-01, HU-02 | Pendiente (bloqueante) |
| 2. Identidad y visibilidad | HU-03 a HU-08 | Mayormente implementada en local; HU-08 pendiente de decisión |
| 3. Capa de datos externa | HU-09 | Pendiente (bloqueante del núcleo) |
| 4. Núcleo del cuidado | HU-10 a HU-14 | Implementada sobre almacenamiento local |
| 5. Vinculación familiar | HU-15 a HU-18 | HU-15 y HU-16 implementadas; HU-17 y HU-18 pendientes |
| 6. Entrada y presentación | HU-19, HU-20 | Implementada con textos provisionales |
| 7. Soporte y cierre | HU-21, HU-22 | HU-21 implementada; HU-22 pendiente |

Restricciones transversales: los parámetros P1–P4 (base de datos externa independiente, persistencia local no definitiva, contrato único de servicios y acceso exclusivo vía backend) condicionan el diseño de todas las historias.

### Camino crítico

`HU-01 → HU-02 → HU-03 → HU-09 → HU-10 → HU-11 → HU-18`

Todo el núcleo ya construido (HU-11 a HU-14, HU-15, HU-16) está hecho sobre almacenamiento local: hasta que HU-01, HU-02 y HU-09 estén cerradas, esos módulos funcionan solo en el dispositivo donde se crearon los datos.

## Renumeración respecto de la versión anterior del documento

| Historia anterior | Historia actual | Motivo del movimiento |
| --- | --- | --- |
| HU-21 Crear base de datos | **HU-01** | Es el primer paso real del desarrollo |
| HU-22 Conectar base de datos | **HU-02** | Inmediatamente después de crearla |
| HU-17 Persistir contra la base externa | **HU-09** | Antes de los módulos, para no reescribirlos |
| HU-08 Panel único | **HU-10** | Es el contenedor de los módulos |
| HU-09 Identificarme con un rol | **HU-07** | Va con la identidad, no con el panel |
| HU-19 Política de roles | **HU-08** | Debe decidirse antes de las pantallas de datos |
| HU-11 Alertas | **HU-13** | Prioridad menor que dosificación y citas |
| HU-12 Tareas | **HU-14** | Prioridad de soporte, no clínica |
| HU-13 Citas | **HU-12** | Mayor valor que alertas y tareas |
| HU-20 Validar escaneo físico | **HU-17** | Cierra el escaneo dentro de su propia fase |
| HU-18 Filtrar por vínculo | **HU-18** | Sin cambio de número; se movió de fase |
| HU-01 Landing | **HU-19** | Presentación al final del núcleo |
| HU-02 Botón de acceso | **HU-20** | Depende de la landing |
| HU-07 Usuarios demo | **HU-21** | Apoyo de pruebas, no funcionalidad |
| HU-16 Contenidos definitivos | **HU-22** | Cierre con dependencia externa |
| HU-03, HU-04, HU-05, HU-06, HU-10, HU-14, HU-15 | Sin cambio | Ya estaban en orden correcto |

## Notas de alcance

- **Base de datos externa independiente (parámetro del proyecto):** el diseño objetivo contempla una base de datos propia y externa, operada por el backend, con la que el sistema se comunica a través de su capa de servicios. El aprovisionamiento y la conexión no se tratan como tareas de infraestructura fuera del backlog, sino como historias de usuario verificables: **HU-01** crea y aprovisiona la base de datos con su esquema y migraciones, y **HU-02** conecta el backend con ella de forma segura.
- La persistencia actual (AsyncStorage en móvil, `localStorage` en web) es un apoyo provisional de desarrollo, no la arquitectura definitiva, y no se sincroniza entre dispositivos; su sustitución es el objeto de HU-09.
- Las verificaciones ya realizadas sobre esta versión: comprobación de tipos (`tsc --noEmit`), análisis estático (`expo lint`), compilación web (`expo export --platform web`) y recorrido funcional completo en navegador (registro, sesión, alta/edición/borrado en los cuatro módulos, persistencia tras recarga, cierre de sesión y acceso con los cuatro usuarios de demostración).
- Los textos de interfaz están en español; los identificadores y mensajes de confirmación de cambios se mantienen en inglés por convención del repositorio.
