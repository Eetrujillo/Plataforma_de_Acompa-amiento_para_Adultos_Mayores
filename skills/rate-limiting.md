# 🛠️ Skill: Rate Limiting de Endpoints de Autenticación

## Regla Base
Todo endpoint de `auth` que **dispara un trabajo costoso o un envío de correo** lleva su propio
límite, aunque el resto del router no lo tenga. El límite se expresa como *N intentos por ventana
móvil*, no por minuto fijo.

## Reglas Obligatorias
1. **El contador se lleva en el caso de uso, no en el router.** El límite es una regla de negocio
   (cuántos correos puede provocar una persona), no una preocupación de transporte. Así se puede
   probar sin levantar HTTP.
2. **Un límite no puede romper la anti-enumeración.** Si el endpoint responde igual para cuentas que
   existen y que no existen, el contador debe incrementarse en **todos** los intentos, incluso para
   correos desconocidos o ya verificados. Un `429` que solo aparece con cuentas reales es un oráculo
   de existencia y es un defecto, no un detalle.
3. **Clave del contador normalizada.** Correo en minúsculas y sin espacios (`normalizeEmail`), igual
   que la búsqueda del usuario: `Cuidador@Example.com` y `cuidador@example.com` comparten contador.
4. **Ventana móvil con reloj inyectable.** La ventana se calcula contra un `now()` inyectado para
   poder probar el vencimiento sin dormir el test. Nunca `setTimeout` ni `sleep`.
5. **Respuesta al exceder: `429` con cuerpo del contrato de errores** —
   `{ "error": { "code": "TOO_MANY_REQUESTS", "message": "...", "details": { "retryAfterSeconds": N } } }`
   vía `AppError` (`statusCode: 429`), no un texto suelto.
6. **El intento bloqueado no se registra.** Contar los rechazos extendería la ventana para siempre y
   convertiría un bloqueo temporal en un bloqueo permanente.
7. **Almacenamiento acotado.** El store en memoria se poda: se descartan entradas cuya ventana ya
   venció y se respeta un tope de claves, para que una dirección de correo inventada no sea un vector
   de crecimiento de memoria.
8. **Limitación conocida y documentada:** el store vive en el proceso. Con más de una réplica del
   backend el límite real es *N por ventana por réplica*; ese día hay que moverlo a un store
   compartido (Redis) sin cambiar el caso de uso.

## Estado Actual
- `POST /api/auth/resend-verification`: **3 intentos por hora** por correo
  (`RESEND_THROTTLE_MAX`, `RESEND_THROTTLE_WINDOW_MINUTES`), implementado en
  `backend/src/modules/auth/application/ResendThrottle.js` y consumido por
  `ResendVerificationEmail`.
- `POST /api/auth/login` todavía **no** tiene límite. Es deuda declarada: mientras no exista, el
  endpoint acepta intentos ilimitados y es el candidato natural para una HU de endurecimiento.
- `POST /api/auth/register` comparte el problema: sin límite, un script puede crear cuentas en masa.

## Pruebas
Todo límite se prueba con casos observables: los primeros *N* pasan, el *N+1* responde `429`, la
ventana vencida vuelve a permitir, y la clave normalizada comparte contador.
