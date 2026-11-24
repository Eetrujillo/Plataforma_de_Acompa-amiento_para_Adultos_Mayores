# Backlog reconciliado — 30 HU en 3 sprints

**Fuente de verdad: el anteproyecto.** La numeración, los módulos y los alcances son los del
documento de entrega (`anteproyecto (2) - corregido.docx`, tabla de la línea 120). Este archivo no
inventa requisitos: rellena cada ID del anteproyecto con el criterio de aceptación que el backlog
anterior ya tenía verificado, y marca explícitamente lo que es nuevo.

**Estado:** ninguna HU implementada. El código se borró en `b3a6b0a`; este documento es el insumo
del rewrite.

## Cómo leer las marcas de origen

| Marca | Significado |
| --- | --- |
| `repo 0XX` | hereda los criterios de aceptación de esa HU del backlog anterior |
| `repo 0XX + repo 0YY` | fusiona dos HU anteriores |
| `nueva` | el anteproyecto la exige y el backlog anterior no tenía nada equivalente |
| `adaptada` | el criterio existe pero cambia por una decisión de stack o de UX |

## Decisiones registradas

- **L1.** Manda el anteproyecto para numeración y alcance; el backlog anterior aporta el detalle de
  los criterios donde encaja.
- **L2.** Stack: TypeScript estricto, React Native (dos APK, sin aplicación web), MongoDB 7 con
  **Mongoose**. Prisma queda descartado: v7 no tiene conector MongoDB.
- **L3.** **Sin PIN.** El anteproyecto exige "ausencia de credenciales para el adulto mayor"; un PIN
  es una credencial. Se retira del alta, del cierre de sesión y de la vinculación. `pinHash` sale del
  modelo.
- **L4.** **Varios familiares por adulto mayor** con permisos equivalentes. El modelo pasa de un
  `caregiverId` por perfil a una colección de vínculos (adulto ↔ familiar con rol).
- **L5.** Los **recordatorios locales** se conservan, ahora en React Native, dentro de HU-018.
- **L6.** El **avance del día** y el **historial de cumplimiento** van dentro de HU-022 (bitácora).
- **L7.** **SOS con presión sostenida** (anteproyecto), no cuenta regresiva.
- **L8.** El **QR se genera antes de vincular**: HU-008 genera, HU-009 vincula, HU-010 regenera.
- **L9.** Se retiran del alcance: HU-011 del backlog anterior (cierre con PIN) y HU-025
  (notificaciones del navegador, imposible sin web; lo cubre FCM).
- **L10.** El bloqueo de login cuenta también los correos sin cuenta, para que el `429` no revele
  qué correos están registrados. Se limita además por IP, para que nadie bloquee a un tercero.
- **L13.** HU-003: el bloqueo de login **no** cuenta los correos sin cuenta (D1 de su tarea, que
  reconcilia el bullet de abajo con `docs/auth-api.md:172-173` y la excepción registrada en la skill
  `jwt-security`): un correo inexistente responde siempre `401` y nunca escribe estado. Queda
  documentada la consecuencia: el `429` del sexto intento revela que la cuenta existe. El límite por
  IP sigue vigente y es el que frena la enumeración en bloque (responde `429 TOO_MANY_REQUESTS`,
  distinto del `429 ACCOUNT_LOCKED`).
- **L11.** La incorporación de otro familiar (HU-011) usa un **token de invitación propio**, enviado
  por correo con enlace. Nunca reusa el QR del adulto mayor: ese token significa "este es su
  dispositivo" y emitirlo invalida el anterior.
- **L12.** La ubicación de seguimiento se conserva **30 días** y se purga por job; la de un SOS vive
  mientras exista la alerta. El consentimiento informa ese plazo y se testea que coincida.

---

## Sprint 1 — Cuentas, perfil, vinculación (HU-001 a HU-012)

### HU-001 · Registro de familiar con correo y contraseña · `repo 001`
Crear una cuenta de familiar para administrar adultos mayores y alertas.
**Skills:** `auth-hexagonal`, `ley-1581`, `secure-code-guardian`
- [ ] Con correo y contraseña válidos crea la cuenta y responde HTTP 201.
- [ ] Correo con formato inválido responde HTTP 400.
- [ ] Correo ya existente responde HTTP 400 indicando duplicidad.
- [ ] Exige contraseña alfanumérica de al menos 8 caracteres.
- [ ] Exige aceptación de la política de tratamiento de datos; sin ella responde HTTP 400 y no escribe nada.
- [ ] Normaliza el correo a minúsculas y sin espacios antes de validar duplicidad y de guardar: `Ana@X.com` y `ana@x.com` son la misma cuenta.
- [ ] Persiste solo el hash bcrypt de la contraseña (costo 10); el texto plano no se guarda ni se loguea.

### HU-002 · Confirmación del correo electrónico · `repo 002`
Validar la propiedad de la cuenta por enlace de correo.
**Skills:** `email-adapter`, `rate-limiting`
- [ ] Envía un correo con token único de confirmación válido 24 horas.
- [ ] La verificación marca el correo como confirmado.
- [ ] Token expirado o ya usado responde el error del contrato, sin distinguir cuál de los dos fue.
- [ ] Bloquea el reenvío al cuarto intento dentro de una hora (HTTP 429).
- [ ] Arma el enlace con `APP_URL` de configuración, nunca con el header `Host` del pedido.
- [ ] Persiste solo `sha256(token)`; el token en claro viaja únicamente en el correo.
- [ ] El contador de reenvíos se incrementa también para correos inexistentes o ya verificados: un 429 que solo aparece con cuentas reales es un oráculo de existencia.

### HU-003 · Inicio de sesión con bloqueo por intentos · `repo 003`
**Skills:** `jwt-security`, `rate-limiting`, `secure-code-guardian`
- [ ] Credenciales correctas responden HTTP 200 con el token JWT de sesión.
- [ ] Credenciales incorrectas responden HTTP 401 **sin especificar qué campo falló**.
- [ ] Bloquea la cuenta 15 minutos tras 5 intentos fallidos consecutivos.
- [ ] El bloqueo se persiste en el usuario: un reinicio del backend no desbloquea.
- [ ] Un login correcto limpia el contador.
- [ ] El token lleva exactamente los claims `sub`, `role`, `email` y `sv`; ningún dato personal más.
- [ ] Cada request autenticado compara el claim `sv` contra `sessionVersion` del usuario: subir la versión cierra todas las sesiones.
- [ ] El contador de intentos se lleva por correo normalizado, **sólo para cuentas reales** (decisión
  L13: un correo sin cuenta responde siempre `401` y nunca escribe estado ni llega al `429`).
- [ ] Además del contador por correo, se limita por IP (`429 TOO_MANY_REQUESTS`) para que nadie
  bloquee a otra persona usando su correo.
- [ ] Acceder a una ruta privada sin token redirige al login sin pedir el recurso.

### HU-004 · Recuperación de contraseña · `repo 004`
**Skills:** `email-adapter`, `jwt-security`, `rate-limiting`
- [ ] Responde un mensaje genérico exista o no el correo ingresado.
- [ ] El enlace funciona una sola vez y expira en 60 minutos.
- [ ] Al completar el cambio se invalidan todas las sesiones previas (sube `sessionVersion`).
- [ ] Persiste solo `sha256(token)` del enlace de reset; el token en claro viaja únicamente en el correo.
- [ ] El endpoint no distingue entre token vencido y token ya usado.

### HU-005 · Varios familiares por adulto mayor con permisos equivalentes · `nueva`
Un adulto mayor puede estar vinculado a más de un familiar, y cualquiera de ellos puede administrarlo.
**Skills:** `profiles-hexagonal`, `ley-1581`
- [ ] Un adulto mayor admite N familiares vinculados simultáneamente.
- [ ] Los familiares vinculados tienen permisos equivalentes: ninguno queda en solo lectura.
- [ ] Agregar un familiar no altera ni revoca los vínculos existentes.
- [ ] El listado de familiares de un adulto solo lo ve quien está vinculado a ese adulto.
- [ ] Un familiar no vinculado recibe HTTP 404 al pedir el perfil, nunca 403.

### HU-006 · Sesión persistente del familiar · `repo 009`
**Skills:** `jwt-security`, `mobile-storage-mmkv`
- [ ] Persiste el token de sesión cifrado en el dispositivo (MMKV) y entra directo en aperturas posteriores.
- [ ] Con token vencido o revocado vuelve al login sin mostrar contenido privado.
- [ ] La app del adulto mayor no pide credenciales en ningún caso: su acceso depende del vínculo del dispositivo.

### HU-007 · Perfil del adulto mayor con ficha médica · `repo 005 (sin PIN) + nueva`
**Skills:** `profiles-hexagonal`, `ley-1581`, `senior-ui-wcag`
- [ ] Crea el perfil asociado al familiar con estado pendiente de vinculación.
- [ ] Registra los datos médicos críticos: grupo sanguíneo, alergias, condiciones, medicación y contacto de emergencia.
- [ ] **No hay PIN**: el perfil no guarda `pinHash` ni exige credencial al alta.
- [ ] Asigna `America/Bogota` como zona horaria si no se especifica.
- [ ] Restringe la vista del perfil a los familiares vinculados.
- [ ] La proyección pública excluye los campos médicos sensibles salvo para el familiar vinculado.
- [ ] El alta no registra consentimiento del titular: eso ocurre en HU-009, cuando el adulto mayor acepta.
- [ ] El perfil se crea con una única fábrica (`User.createSenior`); el alta del panel y el canje del dispositivo usan la misma.
- [ ] El `caregiverId` sale de la sesión, nunca del cuerpo del pedido.
- [ ] El senior no tiene correo propio: lleva un correo sintético único y `passwordHash` nulo.
- [ ] Valida la ficha antes de escribir: grupo sanguíneo de una enumeración cerrada, listas acotadas y longitudes máximas.

### HU-008 · Generar el QR de vinculación · `repo 006`
**Skills:** `pairing-generator`, `qr-adapter`
- [ ] Genera un QR de un solo uso con vigencia de 24 horas.
- [ ] El payload es `{"type":"senior-pairing","token":"…"}`: el token nunca aparece como texto en pantalla.
- [ ] Impide generar un QR si el perfil ya figura vinculado.
- [ ] Si el codificador del QR falla, responde 503 y **no** invalida el QR anterior.
- [ ] El token es de 32 bytes en base64url (43 caracteres) y se persiste solo su `sha256`.
- [ ] El token no aparece en el cuerpo de la respuesta ni en los logs: la única copia en claro es la imagen del QR.
- [ ] Solo existe un QR activo por perfil: emitir invalida los anteriores no usados.
- [ ] Responde 400 sin `seniorId`, 404 con perfil ajeno o inexistente y 409 si el perfil ya está vinculado.

### HU-009 · Vincular el dispositivo con consentimiento previo · `repo 007 + repo 008`
**Skills:** `pairing-link`, `ley-1581`, `qr-adapter`, `senior-ui-wcag`
- [ ] Rechaza un QR cuyo payload no sea `senior-pairing` sin llamar al backend.
- [ ] Muestra el consentimiento con texto ≥ 20pt **antes** del canje.
- [ ] Si el adulto mayor rechaza el consentimiento, cancela el proceso y no guarda nada.
- [ ] Con QR válido y consentimiento aceptado, vincula el dispositivo y guarda el token.
- [ ] Registra fecha, hora y versión del consentimiento aceptado.
- [ ] QR vencido o ya usado muestra exactamente **"Pídele a tu familiar un QR nuevo"**.
- [ ] Bloquea nuevos intentos 15 minutos tras 5 fallos consecutivos.
- [ ] El canje es una escritura condicional atómica: dos escaneos simultáneos del mismo QR producen un solo vínculo y el resto recibe 409.
- [ ] El cliente no reintenta un 409 automáticamente: pide un QR nuevo.
- [ ] El token de dispositivo se guarda cifrado en el almacenamiento local (MMKV), nunca en texto plano ni en logs.

### HU-010 · Regenerar el QR · `repo 006 (invalidación)`
**Skills:** `pairing-generator`, `qr-adapter`
- [ ] Emitir un QR nuevo invalida todos los tokens previos no usados de ese perfil.
- [ ] Un token reemplazado responde igual que uno vencido: no se distingue cuál fue.
- [ ] El panel muestra la fecha de vencimiento tomada de `expiresAt`, no un texto fijo.
- [ ] Un QR vencido no se sigue mostrando como si sirviera.

### HU-011 · Red de cuidadores y asignación · `nueva`
**Skills:** `profiles-hexagonal`, `pairing-generator`
- [ ] Un familiar ya vinculado puede incorporar a otro familiar al mismo adulto mayor.
- [ ] La invitación es un token propio de 32 bytes, independiente del QR del adulto mayor: en la base queda solo su `sha256`, con `seniorId`, quién invitó, correo normalizado, vencimiento a 72 h, `usedAt` y `revokedAt`.
- [ ] La respuesta al pedido de invitación es `202` siempre, exista o no una cuenta con ese correo.
- [ ] El enlace se arma con `APP_URL` y viaja solo en el correo.
- [ ] La aceptación es atómica y exige sesión: el invitado se identifica con su propia cuenta, nunca con la del invitado.
- [ ] Usado, vencido y revocado responden el mismo `409`, sin distinguir cuál fue.
- [ ] Aceptar no modifica los vínculos existentes: los vínculos son aditivos.
- [ ] El invitador puede revocar una invitación pendiente, y el pedido de invitación tiene límite por ventana.
- [ ] El nuevo familiar se identifica con su propia cuenta: no se comparte usuario ni contraseña.
- [ ] Se puede asignar un cuidador principal entre los vinculados.
- [ ] Un familiar no vinculado no puede invitar ni asignar: responde 404, nunca 403.
- [ ] La incorporación queda registrada con quién la hizo y cuándo.

### HU-012 · Reasignación y desvinculación del dispositivo · `repo 010 + nueva`
**Skills:** `profiles-hexagonal`, `pairing-link`
- [ ] Solicita confirmación explícita mediante modal antes de desvincular.
- [ ] Invalida el token del dispositivo y revoca el estado de vinculación en el backend.
- [ ] La app del adulto mayor avisa al detectar la desvinculación y vuelve a la pantalla de vinculación.
- [ ] Reasignar el perfil a otro familiar conserva las actividades y la bitácora, y corta el acceso del anterior.
- [ ] Desvincular no borra el perfil ni sus datos históricos.

---

## Sprint 2 — Actividades, bitácora y sin conexión (HU-013 a HU-022, HU-029, HU-030)

### HU-013 · Crear una actividad · `repo 012`
**Skills:** `activities-hexagonal`, `web-utilities-date-fns`
- [ ] Guarda la actividad ajustada a la zona horaria del adulto mayor.
- [ ] Rechaza títulos vacíos o de más de 60 caracteres.
- [ ] Avisa al familiar si la fecha u hora agendada ya pasó.
- [ ] Asocia la actividad a un perfil del cual el familiar es dueño; un perfil ajeno responde 404.
- [ ] La actividad nace en estado "por aprobar" y no aparece en la rutina del adulto mayor hasta la aprobación de HU-017.

### HU-014 · Repetir una actividad · `repo 013`
**Skills:** `activities-scheduler`
- [ ] Permite "Una sola vez", "Todos los días" o días específicos de la semana.
- [ ] Exige marcar al menos un día al elegir la opción por días.
- [ ] Genera las ocurrencias en la rutina del adulto mayor en los días elegidos.
- [ ] La repetición exige fecha de fin o cantidad máxima de ocurrencias: no se generan ocurrencias indefinidas.

### HU-015 · Editar una actividad · `repo 014`
**Skills:** `activities-hexagonal`, `timezone-bogota`
- [ ] Actualiza la información para las ocurrencias presentes y futuras.
- [ ] Preserva intacto el historial de cumplimiento de días pasados.
- [ ] Mantiene el estado "Completada" si la tarea de hoy ya estaba marcada.

### HU-016 · Eliminar una actividad · `repo 015`
**Skills:** `soft-delete`
- [ ] Solicita confirmación antes de eliminar.
- [ ] La retira de la rutina y cancela los recordatorios futuros.
- [ ] Conserva los registros históricos pasados para auditoría.

### HU-017 · Aprobar la actividad y cuidador de confianza · `nueva`
El anteproyecto introduce la aprobación por parte del adulto mayor o de un cuidador de confianza.
**Skills:** `activities-hexagonal`, `profiles-hexagonal`
- [ ] Una actividad creada por un familiar queda en estado "por aprobar" hasta que el adulto mayor o el cuidador de confianza la acepte.
- [ ] El cuidador de confianza es un familiar designado y no puede ser cualquier vinculado.
- [ ] Una actividad rechazada no aparece en la rutina del adulto mayor.
- [ ] La aprobación queda registrada con quién la dio y cuándo.
- [ ] Reasignar o desvincular al cuidador de confianza deja las actividades en "por aprobar", no las borra.

### HU-018 · Ver la agenda del día y recibir recordatorios locales · `repo 017 + repo 016`
**Skills:** `senior-ui-wcag`, `mobile-notifications-push`
- [ ] Lista únicamente las actividades de hoy, ordenadas por hora, con fuentes ≥ 20pt.
- [ ] Diferencia claramente "Pendiente" de "Completada" por texto, ícono y forma, no solo por color.
- [ ] Muestra "Hoy no tienes actividades" si la agenda está vacía.
- [ ] Programa en el dispositivo una notificación local con sonido a la hora exacta de cada actividad.
- [ ] Emite un segundo aviso 10 minutos después si la actividad sigue pendiente.
- [ ] Los recordatorios funcionan sin conexión; el segundo aviso se programa en el dispositivo, no en el servidor.
- [ ] Declara y verifica el permiso de alarmas exactas de Android 12+.

### HU-019 · Confirmar una actividad cumplida · `repo 018`
**Skills:** `senior-ui-wcag`, `mobile-storage-mmkv`
- [ ] Cambia visualmente la tarjeta a "Completada" de inmediato al tocar, antes de la respuesta del servidor.
- [ ] Habilita "Deshacer" durante 10 segundos.
- [ ] Registra la marca de tiempo exacta (`completedAt`) del toque.
- [ ] El control cumple 48x48 CSS px y tiene etiqueta de accesibilidad.

### HU-020 · Alerta de omisión a los 30 minutos · `repo 028 + repo 020`
**Skills:** `web-realtime-socket-io`, `mobile-notifications-push`
- [ ] Clasifica cada tarea como Pendiente, Completada o Vencida.
- [ ] Marca "Vencida" automáticamente si pasan 30 minutos sin confirmación.
- [ ] Emite un único aviso al familiar por cada actividad vencida.
- [ ] Anula el aviso si una confirmación tardía (offline) demuestra que sí se realizó a tiempo.
- [ ] El panel se actualiza en menos de 10 segundos tras recibir una confirmación.

### HU-021 · Registrar una nota en la bitácora · `nueva`
**Skills:** `caregiver-ui`, `timezone-bogota`
- [ ] Registra una nota de texto del familiar asociada al adulto mayor y a una fecha.
- [ ] La hora se asigna automáticamente en el servidor: el cliente no la puede imponer.
- [ ] Rechaza notas vacías y por encima del límite de caracteres definido.
- [ ] El límite de la nota es de 1000 caracteres, validado en el servidor y no solo en el cliente.
- [ ] Solo los familiares vinculados pueden escribir en la bitácora de ese adulto.

### HU-022 · Ver la bitácora del día con avance e historial · `nueva + repo 021 + repo 022`
**Skills:** `caregiver-ui`, `senior-ui-wcag`, `history-analytics`
- [ ] Muestra las notas del día, visibles también para el adulto mayor.
- [ ] Muestra el avance del día como barra e indicador numérico ("3 de 5 completadas").
- [ ] Excluye las tareas Vencidas del conteo de completadas.
- [ ] Despliega resúmenes semanales y mensuales de cumplimiento acumulado.
- [ ] Permite seleccionar cualquier día pasado y ver el detalle de sus actividades.

### HU-029 · Cola local de actividades confirmadas sin red · `repo 019`
**Skills:** `mobile-storage-sqlite-powersync`, `senior-ui-wcag`
- [ ] Guarda los eventos de marcado en una cola local si el dispositivo no tiene red.
- [ ] Sincroniza automáticamente los eventos pendientes al reconectarse.
- [ ] Transmite al servidor la hora real en que se tocó el botón, no la de sincronización.
- [ ] La agenda abre con la última rutina guardada localmente, con señal o sin ella.

### HU-030 · Cola local del SOS y la ubicación · `repo 024`
**Skills:** `mobile-storage-sqlite-powersync`, `sos-hexagonal`
- [ ] Muestra "Sin conexión. Reintentando..." si falla el envío inicial.
- [ ] Reintenta cada 15 segundos hasta tener respuesta del servidor.
- [ ] Preserva la hora de activación original en el payload enviado.
- [ ] Una alerta encolada nunca se descarta por reintentos agotados: se entrega al recuperar red.

---

## Sprint 3 — Comunicación, emergencias, ubicación (HU-023 a HU-028)

### HU-023 · Botón Llamar · `nueva`
**Skills:** `senior-ui-wcag`, `mobile-deep-linking-app-links`
- [ ] Botón permanente en la app del adulto mayor para llamar al contacto de emergencia.
- [ ] Usa el marcador telefónico del sistema, sin pedir permisos adicionales.
- [ ] Si no hay contacto configurado, el botón no se muestra en vez de fallar al tocarlo.
- [ ] Cumple 48x48 CSS px, contraste AA y etiqueta de accesibilidad.

### HU-024 · SOS con presión sostenida · `repo 023 (adaptada, L7)`
**Skills:** `senior-ui-wcag`, `sos-hexagonal`
- [ ] El botón rojo SOS está siempre visible, sin scroll y sin abrir menús.
- [ ] La alerta se dispara solo tras mantener presionado el tiempo definido (3 segundos), con instrucción visible en pantalla.
- [ ] Una presión más corta cancela sin enviar y sin mensaje de error.
- [ ] Al dispararse, emite la alerta al servidor con la hora de activación.
- [ ] El botón nunca queda detrás de un modal, de una pantalla de actividad ni de un permiso del sistema.

### HU-025 · Tarjeta de auxilio médico en pantalla · `nueva`
**Skills:** `senior-ui-wcag`, `ley-1581`
- [ ] Muestra la ficha médica crítica (grupo sanguíneo, alergias, condiciones, medicación, contacto) desde la app del adulto mayor.
- [ ] Accesible sin desbloquear credenciales y sin conexión.
- [ ] Legible en 20pt mínimo y con contraste AA.
- [ ] Solo muestra los campos que el titular consintió compartir.

### HU-026 · Recibir y atender la alerta SOS · `repo 026 + repo 027`
**Skills:** `web-realtime-socket-io`, `realtime-alerts`, `caregiver-ui`
- [ ] Emite alarma sonora y despliega un banner rojo destacado en menos de 10 segundos.
- [ ] Detalla el nombre del adulto mayor y la hora exacta de activación.
- [ ] Mantiene la alerta roja fija hasta que un familiar la marque como atendida.
- [ ] Al marcar "Atendida" silencia la alarma, quita el banner y guarda quién la atendió y cuándo.
- [ ] Muestra la ubicación recibida en un mapa interactivo centrado en la posición, con su marca de tiempo.
- [ ] Muestra "Ubicación no disponible" si el SOS llegó sin coordenadas, sin romper la alerta.
- [ ] El canal en tiempo real exige autenticación: ninguna alerta de un adulto llega a un cuidador ajeno.
- [ ] Si el familiar no tiene la app abierta, la alerta llega igual por FCM: el canal en tiempo real acelera, no reemplaza.

### HU-027 · Ubicación periódica y ubicación con la alerta · `nueva + repo 029`
**Skills:** `mobile-storage-mmkv`, `ley-1581`, `sos-hexagonal`
- [ ] Envía la ubicación cada 30 minutos mientras el dispositivo está vinculado.
- [ ] Adjunta las coordenadas GPS a la alerta SOS en el momento de la activación.
- [ ] Envía la alerta sin coordenadas si el GPS está desactivado o excede el tiempo límite.
- [ ] Solicita el permiso de ubicación informando su uso exclusivo para SOS y seguimiento consentido.
- [ ] El seguimiento periódico se detiene al desvincular el dispositivo.
- [ ] El titular puede revocar el consentimiento de ubicación sin perder el vínculo ni las actividades.
- [ ] Los puntos de seguimiento se purgan a los **30 días** de su captura mediante un job programado.
- [ ] La ubicación adjunta a una alerta SOS **no** entra en esa purga: se conserva mientras exista la alerta y se borra con ella.
- [ ] El texto de consentimiento informa esa retención, y una prueba verifica que el código y el texto dicen el mismo plazo.

### HU-028 · Aviso de desconexión del dispositivo · `nueva`
**Skills:** `web-realtime-socket-io`, `mobile-notifications-push`
- [ ] Detecta que el dispositivo dejó de reportar y avisa al familiar.
- [ ] No confunde "sin conexión" con "app cerrada": el aviso se basa en el silencio del heartbeat, no en un único evento.
- [ ] Un dispositivo que recupera el reporte cancela el aviso sin intervención del familiar.
- [ ] El aviso no se repite en cada ciclo mientras dure la desconexión.
- [ ] El umbral de silencio que dispara el aviso es explícito y configurable; no se infiere de un único evento perdido.

---

## Fuera de alcance (decisión registrada, no olvido)

| Requisito anterior | Motivo del retiro |
| --- | --- |
| Cierre de sesión con PIN del adulto mayor | L3: el anteproyecto prohíbe credenciales para el adulto mayor. |
| Notificaciones del navegador | L9: no hay aplicación web. Lo cubre FCM en las dos apps. |
| `pinHash` en el modelo | Consecuencia de L3. |

## Cambios de modelo que este backlog obliga

1. **Vínculos múltiples**: de `caregiverId` en el perfil a una colección de vínculos (adulto, familiar,
   rol, estado, quién invitó, cuándo). Consecuencia de L4 y HU-005/HU-011.
2. **Ficha médica**: campos nuevos en el perfil, con consentimiento separado del de la cuenta.
3. **Sin `pinHash`**: consecuencia de L3.
4. **Consentimiento por titular y por finalidad**: el de la cuenta (HU-001) no cubre el de compartir
   datos del adulto mayor (HU-009) ni el de ubicación (HU-027).
5. **`linkStatus`** sigue siendo dato, no vista: un perfil sin vínculo activo no recibe actividades ni
   recolección de datos.
