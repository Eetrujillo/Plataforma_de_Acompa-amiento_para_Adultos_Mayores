# Reglas del PIN de 4 dígitos — HU-005 / HU-007

El PIN es el secreto con el que el adulto mayor confirma quién es en su propia app. Estas reglas
aplican a cualquier código que lo reciba, lo guarde o lo verifique.

## 1. Forma

- Exactamente 4 dígitos ASCII: `/^\d{4}$/`. Se rechazan `"123"`, `"12345"`, `"12a4"`, `" 1234"`,
  `"1234 "`, los dígitos de otros alfabetos (`"１２３４"`) y los tipos no string (`4821`).
- El cero a la izquierda es válido (`"0007"`): el PIN es un texto de 4 caracteres, no un número.
- Se valida **antes** de hashear. Un pedido inválido no gasta bcrypt ni escribe nada.

## 2. Almacenamiento

- Se guarda `pinHash` con bcrypt y costo **12**, más alto que el de la contraseña (10). El costo
  es configurable en `BcryptPasswordHasher({ saltRounds })` justamente para esto.
- El hasher se inyecta: el caso de uso no importa `bcrypt`. Cambiar de algoritmo no puede tocar la
  capa de aplicación.
- El texto plano no se persiste, no se loguea, no se devuelve en ninguna respuesta y no aparece
  en un mensaje de error (el error dice el formato, nunca el valor).
- La proyección pública del perfil no incluye `pinHash`. Si un campo nuevo se agrega a la
  respuesta, se revisa explícitamente que no sea este.

## 3. El hash no es la defensa principal

Cuatro dígitos son **10 000** combinaciones. Con el hash en la mano, un atacante prueba todas:
bcrypt con costo 12 encarece el ataque, no lo impide. La defensa real son los intentos:

- **Obligatorio desde la primera verificación de PIN** (HU-007): contador de fallos por perfil y
  bloqueo temporal (5 fallos consecutivos → 15 minutos), con el mismo patrón ya usado en
  `domain/loginLockout.js`.
- El contador es **por perfil**, no por dispositivo ni por IP: el atacante que cambia de
  dispositivo tiene que seguir gastando intentos.
- Un PIN correcto reinicia el contador y levanta el bloqueo.
- Sin ese límite no se expone ningún endpoint que verifique el PIN. En HU-005 no existe:
  el PIN se define al crear el perfil y no se verifica del lado del servidor todavía.

## 4. Lo que no se hace

- No se agrega un "pepper" o HMAC sin un plan de rotación: si la clave cambia, todos los PIN
  quedan inválidos y el adulto mayor no puede entrar.
- No se reutiliza el bloqueo de login del familiar (`failedLoginAttempts` / `lockedUntil`): son
  otra cuenta, otro umbral y otro mensaje.
- No se envía el PIN por correo, SMS ni notificación, ni se muestra en pantalla después del alta.
- No se compara con `===` ni con un hash determinístico: siempre bcrypt.
- No hay "recuperar PIN". Si se olvida, el familiar lo define de nuevo (pantalla de perfil); el
  valor viejo se reemplaza, no se revela.

## 5. Dónde vive

- Reglas de forma y proyección: `backend/src/modules/seniors/domain/seniorProfile.js`.
- Hash: `backend/src/modules/auth/infrastructure/BcryptPasswordHasher.js` (costo 12 para PIN).
- Contrato HTTP: `docs/seniors-api.md`.
- Reglas del slice: `skills/profiles-hexagonal.md`.
