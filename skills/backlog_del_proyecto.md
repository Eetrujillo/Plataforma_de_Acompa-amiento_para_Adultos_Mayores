# Backlog del Proyecto

## 📌 Puntero de Estado Actual
- **Última HU completada:** HU-004
- **Siguiente HU a ejecutar:** HU-005

---

## 🚀 SPRINT 1: Autenticación, Perfiles, Vinculación y Consentimiento

- [x] **HU-001: Registrarme como familiar**
  - **Descripción:** Crear una cuenta de familiar con correo y contraseña para administrar adultos mayores y alertas.
  - **📁 Skills / Reglas a consultar:**
    - `skills/auth-hexagonal.md`
    - `skills/ley-1581.md`
  - **Criterios de Aceptación:**
    - [ ] Con correo y contraseña válidos, crea la cuenta y responde HTTP 201.
    - [ ] Si el correo tiene formato inválido, retorna HTTP 400.
    - [ ] Si el correo ya existe, retorna HTTP 400 indicando duplicidad.
    - [ ] Exige contraseña alfanumérica de al menos 8 caracteres.
    - [ ] Exige la aceptación de la política de tratamiento de datos.

- [x] **HU-002: Confirmar mi correo electrónico**
  - **Descripción:** Recibir y abrir un enlace de confirmación por correo para validar la propiedad de la cuenta.
  - **📁 Skills / Reglas a consultar:**
    - `skills/email-adapter.md`
    - `skills/rate-limiting.md`
  - **Criterios de Aceptación:**
    - [ ] Envia un correo con un token único de confirmación válido por 24 horas.
    - [ ] El endpoint de verificación cambia el estado a `isEmailVerified: true`.
    - [ ] Muestra error si el token expiró o ya fue utilizado.
    - [ ] Bloquea solicitudes de reenvío si se superan 3 intentos por hora.

- [x] **HU-003: Iniciar sesión**
  - **Descripción:** Iniciar sesión con correo y contraseña para acceder al panel web de administración del familiar.
  - **📁 Skills / Reglas a consultar:**
    - `skills/jwt-security.md`
    - `skills/rate-limiting.md`
  - **Criterios de Aceptación:**
    - [ ] Con datos correctos, retorna HTTP 200 y el token JWT de sesión.
    - [ ] Con datos incorrectos, devuelve HTTP 401 sin especificar qué campo falló.
    - [ ] Bloquea la cuenta por 15 minutos tras 5 intentos fallidos consecutivos.
    - [ ] Redirige al login al intentar acceder a rutas privadas sin token.

- [x] **HU-004: Recuperar mi contraseña**
  - **Descripción:** Recibir un enlace temporal en el correo para restablecer la contraseña en caso de olvido.
  - **📁 Skills / Reglas a consultar:**
    - `skills/email-adapter.md`
    - `skills/jwt-security.md`
  - **Criterios de Aceptación:**
    - [ ] Retorna un mensaje genérico de confirmación exista o no el correo ingresado.
    - [ ] El enlace de restablecimiento funciona una sola vez y expira en 60 minutos.
    - [ ] Invalida tokens de sesión previos tras completar el cambio de clave.

- [ ] **HU-005: Crear el perfil de mi adulto mayor**
  - **Descripción:** Registrar el perfil del adulto mayor con su nombre, PIN de 4 dígitos y zona horaria.
  - **📁 Skills / Reglas a consultar:**
    - `skills/profiles-hexagonal.md`
    - `skills/bcrypt-pin.md`
  - **Criterios de Aceptación:**
    - [ ] Crea el perfil asociado al familiar con estado pendiente de vinculación.
    - [ ] Exige que el PIN sea exactamente de 4 dígitos numéricos y lo almacena cifrado.
    - [ ] Asigna por defecto la zona horaria `America/Bogota` si no se especifica.
    - [ ] Restringe la vista del perfil únicamente al familiar propietario.

- [ ] **HU-006: Generar un código de vinculación**
  - **Descripción:** Generar un código alfanumérico de 6 dígitos y un QR para conectar la app móvil del adulto mayor.
  - **📁 Skills / Reglas a consultar:**
    - `skills/pairing-generator.md`
    - `skills/qr-adapter.md`
  - **Criterios de Aceptación:**
    - [ ] Genera un código de 6 dígitos y una imagen QR con vigencia de 24 horas.
    - [ ] Invalida automáticamente cualquier código de vinculación previo no usado.
    - [ ] Impide generar nuevos códigos si el perfil ya figura como vinculado.

- [ ] **HU-007: Vincular mi app con el código**
  - **Descripción:** Ingresar o escanear el código de vinculación en la app móvil para conectar con la cuenta del familiar.
  - **📁 Skills / Reglas a consultar:**
    - `skills/senior-ui-wcag.md`
    - `skills/pairing-link.md`
  - **Criterios de Aceptación:**
    - [ ] Con código válido y consentimiento previo, conecta la app y guarda el token de dispositivo.
    - [ ] Muestra el mensaje claro "Pídele a tu familiar un código nuevo" si el código venció.
    - [ ] Bloquea nuevos intentos por 15 minutos tras 5 fallos consecutivos de código.

- [ ] **HU-008: Aceptar o rechazar el consentimiento**
  - **Descripción:** Leer y aceptar la declaración de datos compartidos (actividades, SOS y GPS) antes de usar la app.
  - **📁 Skills / Reglas a consultar:**
    - `skills/ley-1581.md`
    - `skills/senior-ui-wcag.md`
  - **Criterios de Aceptación:**
    - [ ] Muestra el texto explicativo con tipografía grande (>= 20sp) antes de finalizar la vinculación.
    - [ ] Si se rechaza, cancela el proceso y no guarda información en el sistema.
    - [ ] Si se acepta, registra la fecha, hora y versión del consentimiento aceptado.

- [ ] **HU-009: Mantener mi sesión abierta en la app**
  - **Descripción:** Abrir la app móvil directamente en la lista de actividades sin volver a solicitar claves ni códigos.
  - **📁 Skills / Reglas a consultar:**
    - `skills/capacitor-preferences.md`
    - `skills/offline-first.md`
  - **Criterios de Aceptación:**
    - [ ] Persiste el token de dispositivo localmente para ingresar de forma directa en aperturas posteriores.
    - [ ] Carga la última rutina guardada en almacenamiento local si no hay internet.
    - [ ] Redirige a la pantalla de vinculación si el familiar desvinculó el dispositivo.

- [ ] **HU-010: Desvincular a mi adulto mayor**
  - **Descripción:** Desconectar la app del adulto mayor desde el panel web del familiar para revocar el acceso.
  - **📁 Skills / Reglas a consultar:**
    - `skills/pairing-unlink.md`
    - `skills/jwt-security.md`
  - **Criterios de Aceptación:**
    - [ ] Solicita confirmación explícita mediante una ventana modal antes de proceder.
    - [ ] Invalida el token del dispositivo y revoca el estado de vinculación en el backend.
    - [ ] Muestra un aviso en la app del adulto mayor al detectar la desvinculación.

- [ ] **HU-011: Cerrar sesión con mi PIN**
  - **Descripción:** Solicitar el PIN de 4 dígitos al intentar cerrar sesión en la app móvil para evitar cierres accidentales.
  - **📁 Skills / Reglas a consultar:**
    - `skills/bcrypt-pin.md`
    - `skills/senior-ui-wcag.md`
  - **Criterios de Aceptación:**
    - [ ] Muestra una ventana modal solicitando el PIN al pulsar "Cerrar Sesión".
    - [ ] Elimina los tokens locales y cierra sesión solo si el PIN ingresado es correcto.
    - [ ] Aplica un bloqueo temporal de 5 minutos tras 5 intentos fallidos de PIN.

---

## 🚀 SPRINT 2: Rutinas, Actividades y Monitoreo de Cumplimiento

- [ ] **HU-012: Crear una actividad**
  - **Descripción:** Programar una actividad con título, fecha, hora e ícono asignada al adulto mayor.
  - **📁 Skills / Reglas a consultar:**
    - `skills/activities-hexagonal.md`
    - `skills/timezone-bogota.md`
  - **Criterios de Aceptación:**
    - [ ] Guarda la actividad en la base de datos ajustada a la zona horaria del adulto mayor.
    - [ ] Rechaza títulos vacíos o mayores a 60 caracteres.
    - [ ] Notifica al familiar si la fecha/hora agendada pertenece al pasado.

- [ ] **HU-013: Repetir una actividad**
  - **Descripción:** Configurar repeticiones automáticas (diarias o por días específicos) para una actividad agendada.
  - **📁 Skills / Reglas a consultar:**
    - `skills/activities-scheduler.md`
  - **Criterios de Aceptación:**
    - [ ] Permite seleccionar patrones: "Una sola vez", "Todos los días" o días específicos de la semana.
    - [ ] Exige marcar al menos un día al seleccionar la opción por días de la semana.
    - [ ] Genera las actividades automáticamente en la rutina del adulto mayor en los días elegidos.

- [ ] **HU-014: Editar una actividad**
  - **Descripción:** Modificar el horario, título o ícono de una actividad existente desde el panel del familiar.
  - **📁 Skills / Reglas a consultar:**
    - `skills/activities-hexagonal.md`
  - **Criterios de Aceptación:**
    - [ ] Actualiza la información de la actividad para las ocurrencias presentes y futuras.
    - [ ] Preserva intacto el historial de cumplimiento de días pasados.
    - [ ] Mantiene el estado "Completada" si la tarea de hoy ya había sido marcada.

- [ ] **HU-015: Eliminar una actividad**
  - **Descripción:** Eliminar una actividad agendada para evitar que siga apareciendo en la rutina del adulto mayor.
  - **📁 Skills / Reglas a consultar:**
    - `skills/soft-delete.md`
  - **Criterios de Aceptación:**
    - [ ] Solicita confirmación antes de eliminar la actividad.
    - [ ] Retira la actividad de la rutina diaria y cancela recordatorios futuros.
    - [ ] Conserva los registros históricos pasados para fines de auditoría.

- [ ] **HU-016: Recibir recordatorio de mis actividades**
  - **Descripción:** Recibir notificaciones locales con sonido en el celular a la hora de cada actividad.
  - **📁 Skills / Reglas a consultar:**
    - `skills/capacitor-notifications.md`
    - `skills/offline-first.md`
  - **Criterios de Aceptación:**
    - [ ] Emite una notificación local con sonido e ícono a la hora exacta configurada.
    - [ ] Emite un segundo recordatorio 10 minutos después si la tarea continúa pendiente.
    - [ ] Funciona de forma autónoma sin necesidad de conexión a internet.

- [ ] **HU-017: Ver mis actividades del día**
  - **Descripción:** Visualizar en una lista simple de texto grande las actividades correspondientes al día de hoy.
  - **📁 Skills / Reglas a consultar:**
    - `skills/senior-ui-wcag.md`
    - `skills/offline-first.md`
  - **Criterios de Aceptación:**
    - [ ] Lista únicamente las actividades de hoy ordenadas por hora con fuentes >= 20sp.
    - [ ] Diferencia claramente entre tareas "Pendientes" y "Completadas".
    - [ ] Muestra "Hoy no tienes actividades" si la agenda del día está vacía.

- [ ] **HU-018: Marcar una actividad como completada**
  - **Descripción:** Presionar un botón grande sobre la tarea realizada para registrar su cumplimiento.
  - **📁 Skills / Reglas a consultar:**
    - `skills/senior-ui-wcag.md`
    - `skills/undo-action.md`
  - **Criterios de Aceptación:**
    - [ ] Cambia visualmente el estado de la tarjeta a "Completada" de forma inmediata al tocar.
    - [ ] Habilita la opción "Deshacer" durante los siguientes 10 segundos.
    - [ ] Registra la marca de tiempo exacta (`completedAt`) del momento del toque.

- [ ] **HU-019: Completar actividades sin internet**
  - **Descripción:** Registrar el marcado de actividades offline para que se sincronicen al recuperar señal.
  - **📁 Skills / Reglas a consultar:**
    - `skills/offline-sync-queue.md`
    - `skills/indexeddb-storage.md`
  - **Criterios de Aceptación:**
    - [ ] Guarda los eventos de marcado en una cola local si el dispositivo no tiene red.
    - [ ] Sincroniza automáticamente los eventos pendientes al reconectarse a internet.
    - [ ] Transmite al servidor la hora real en que se tocó el botón en el celular.

- [ ] **HU-020: Ver el estado de las actividades del día**
  - **Descripción:** Monitorear en tiempo real si las actividades del día están Pendientes, Completadas o Vencidas.
  - **📁 Skills / Reglas a consultar:**
    - `skills/polling-realtime.md`
    - `skills/activities-status.md`
  - **Criterios de Aceptación:**
    - [ ] Clasifica cada tarea en estado Pendiente, Completada o Vencida.
    - [ ] Marca automáticamente una tarea como Vencida si transcurren 30 minutos sin realizarse.
    - [ ] Actualiza el panel web en menos de 10 segundos tras recibir confirmaciones.

- [ ] **HU-021: Ver el avance del día**
  - **Descripción:** Consultar una barra de progreso y porcentaje de tareas cumplidas en el día por el adulto mayor.
  - **📁 Skills / Reglas a consultar:**
    - `skills/caregiver-ui.md`
    - `skills/progress-math.md`
  - **Criterios de Aceptación:**
    - [ ] Muestra una barra de progreso e indicador numérico (ej. "3 de 5 completadas").
    - [ ] Excluye las tareas en estado Vencido del conteo de completadas.
    - [ ] Actualiza el indicador dinámicamente según el flujo de confirmaciones.

- [ ] **HU-022: Consultar el historial de cumplimiento**
  - **Descripción:** Revisar métricas y porcentajes de cumplimiento de semanas y meses anteriores.
  - **📁 Skills / Reglas a consultar:**
    - `skills/caregiver-ui.md`
    - `skills/history-analytics.md`
  - **Criterios de Aceptación:**
    - [ ] Despliega resúmenes semanales y mensuales de cumplimiento acumulado.
    - [ ] Permite seleccionar cualquier día pasado para ver el detalle de actividades.

---

## 🚀 SPRINT 3: Alertas de Emergencia SOS, Notificaciones y Ubicación GPS

- [ ] **HU-023: Pedir ayuda con el botón SOS**
  - **Descripción:** Presionar un botón rojo de auxilio para enviar una alerta inmediata a la familia.
  - **📁 Skills / Reglas a consultar:**
    - `skills/senior-ui-wcag.md`
    - `skills/sos-hexagonal.md`
  - **Criterios de Aceptación:**
    - [ ] Muestra el botón SOS rojo permanentemente accesible en la app móvil.
    - [ ] Inicia una cuenta regresiva de 5 segundos con botón grande "Cancelar".
    - [ ] Emite la alerta de auxilio al servidor si el contador llega a cero.

- [ ] **HU-024: Enviar el SOS aunque tenga mala conexión**
  - **Descripción:** Reintentar automáticamente el envío de la alerta SOS si falla la conexión a internet.
  - **📁 Skills / Reglas a consultar:**
    - `skills/offline-sync-queue.md`
    - `skills/sos-hexagonal.md`
  - **Criterios de Aceptación:**
    - [ ] Muestra el mensaje "Sin conexión. Reintentando..." si falla el envío inicial.
    - [ ] Reintenta el envío cada 15 segundos automáticamente hasta tener respuesta del servidor.
    - [ ] Preserva la hora de activación original en el payload enviado al backend.

- [ ] **HU-025: Activar las notificaciones en mi navegador**
  - **Descripción:** Conceder permisos de notificaciones en el navegador para recibir alertas SOS emergentes.
  - **📁 Skills / Reglas a consultar:**
    - `skills/web-notifications-api.md`
  - **Criterios de Aceptación:**
    - [ ] Solicita el permiso de notificaciones del navegador al ingresar al panel del familiar.
    - [ ] Muestra un aviso de advertencia si los permisos son denegados por el usuario.

- [ ] **HU-026: Recibir una alerta de SOS**
  - **Descripción:** Desplegar una alerta roja ruidosa en el panel del familiar al recibirse una señal de ayuda.
  - **📁 Skills / Reglas a consultar:**
    - `skills/realtime-alerts.md`
    - `skills/caregiver-ui.md`
  - **Criterios de Aceptación:**
    - [ ] Emite una alarma sonora y despliega un banner rojo destacado en menos de 10 segundos.
    - [ ] Detalla el nombre del adulto mayor y la hora exacta de activación del SOS.
    - [ ] Mantiene la alerta roja fija hasta que el familiar la marque como atendida.

- [ ] **HU-027: Marcar una alerta como atendida**
  - **Descripción:** Confirmar en el panel que la alerta SOS fue gestionada para apagar la alarma.
  - **📁 Skills / Reglas a consultar:**
    - `skills/sos-hexagonal.md`
    - `skills/caregiver-ui.md`
  - **Criterios de Aceptación:**
    - [ ] Silencia el sonido de alarma y quita el banner de emergencia al presionar "Atendida".
    - [ ] Guarda el nombre del familiar y la hora exacta en que se gestionó la respuesta.

- [ ] **HU-028: Recibir aviso de una actividad no cumplida**
  - **Descripción:** Recibir una notificación en el panel cuando una actividad cumpla 30 minutos de retraso.
  - **📁 Skills / Reglas a consultar:**
    - `skills/background-cron.md`
    - `skills/web-notifications-api.md`
  - **Criterios de Aceptación:**
    - [ ] Genera un aviso automático al familiar a los 30 minutos de vencimiento de la tarea.
    - [ ] Emite una única notificación por cada actividad no cumplida.
    - [ ] Anula el aviso si la confirmación tardía (offline) demuestra que sí se realizó a tiempo.

- [ ] **HU-029: Compartir mi ubicación al pedir ayuda**
  - **Descripción:** Adjuntar la posición GPS del celular a la alerta SOS al presionar el botón de ayuda.
  - **📁 Skills / Reglas a consultar:**
    - `skills/capacitor-geolocation.md`
    - `skills/ley-1581.md`
  - **Criterios de Aceptación:**
    - [ ] Obtiene las coordenadas GPS actuales durante los 5 segundos de la cuenta regresiva.
    - [ ] Envía la alerta sin coordenadas si el GPS está desactivado o excede el tiempo límite.
    - [ ] Solicita los permisos correspondientes de ubicación informando su uso exclusivo para SOS.

- [ ] **HU-030: Ver en un mapa dónde está mi adulto mayor al pedir ayuda**
  - **Descripción:** Visualizar la ubicación GPS desde donde se envió el SOS en un mapa interactivo.
  - **📁 Skills / Reglas a consultar:**
    - `skills/leaflet-maps-adapter.md`
    - `skills/caregiver-ui.md`
  - **Criterios de Aceptación:**
    - [ ] Despliega un mapa interactivo centrado en la posición recibida con la alerta SOS.
    - [ ] Muestra "Ubicación no disponible" si el SOS se transmitió sin coordenadas GPS.
    - [ ] Permite hacer zoom y consultar la marca de tiempo de lectura del GPS.