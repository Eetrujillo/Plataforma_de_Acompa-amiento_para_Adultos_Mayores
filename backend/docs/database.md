# Base de datos: aprovisionamiento y conexión

**Slice:** S1 · **Historias:** HU-01 (aprovisionar) y HU-02 (conectar el backend).
**Motor:** MongoDB, a través de Prisma.
**Instancia objetivo:** gestionada y externa a la aplicación (producción: `https://adulto-mayor.apolobyte.online/`).
**Estado de este documento:** define el procedimiento; la aplicación del esquema a la instancia real queda pendiente de que exista el URI de conexión.

## 1. Por qué replica set y no un `mongod` suelto

Prisma envuelve las escrituras en transacciones, y MongoDB solo soporta transacciones dentro de un **replica set**. Un `mongod` standalone falla con `P2031` en el primer `create` o `update`.

- **Instancia gestionada:** los servicios de MongoDB gestionados ya entregan un replica set; no hay nada que configurar.
- **Entorno local con Docker** (ver §8): el `docker-compose.yml` del repositorio ya lo resuelve con `--replSet rs0` y un servicio de inicialización idempotente.

## 2. Crear la instancia

1. Crear el clúster en el proveedor elegido, en la región más cercana a los usuarios.
2. Nombre de la base: **`mearn_db`**, el mismo que usa el entorno local y el `docker-compose.yml`. Cambiarlo obliga a cambiar `DATABASE_URL` en todos los entornos.
3. Nivel mínimo: el gratuito alcanza para desarrollo y pruebas; producción necesita el plan que incluya copias automáticas.
4. Crear **dos usuarios** distintos:
   - `aam_app` con rol `readWrite` **solo** sobre `mearn_db`. Es el usuario que usa el servidor.
   - `aam_migrator` con permisos de administración de esquema, usado **solo** al aplicar el esquema.
5. Restringir el acceso por red: lista de IP permitidas. En producción, solo las del backend.

Sin esto último, la base es alcanzable desde cualquier lugar y el resto de las medidas no sirven.

## 3. Cadena de conexión

Instancia gestionada (TLS obligatorio, que el proveedor exige):

```
mongodb+srv://aam_app:<password>@<cluster>/mearn_db?retryWrites=true&w=majority&tls=true&appName=acompanamiento
```

Entorno local con Docker (el puerto publicado es 4301; `directConnection` evita que el descubrimiento del replica set apunte al nombre del servicio `mongo`, que fuera de la red de Docker no resuelve):

```
mongodb://localhost:4301/mearn_db?directConnection=true
```

**Las credenciales no se escriben en el repositorio.** Van en `backend/.env`, que está ignorado por git (`.gitignore` incluye `.env`). El ejemplo sin valores es `backend/env.sample`.

## 4. Aplicar el esquema

```bash
cd backend
cp env.sample .env          # completar DATABASE_URL con la instancia real
npm install                 # instala el CLI de Prisma (solo herramientas de base)
npm run db:validate         # el esquema está bien formado
npm run db:push             # aplica colecciones e índices a la instancia
```

`db:push` es la operación correcta para MongoDB: aplica el esquema y crea los índices declarados. No hay migraciones SQL porque el motor no las usa; lo que sí exige el criterio de HU-01 es que **este procedimiento sea único, versionado y repetible**: correrlo sobre una instancia vacía la deja operativa sin pasos manuales no registrados.

## 5. Verificar que quedó operativa

1. El documento lista las colecciones esperadas:

   ```bash
   mongosh "$DATABASE_URL" --quiet --eval 'db.getCollectionNames().sort()'
   ```

   Deben aparecer: `Activity`, `Alerta`, `Cita`, `Dosificacion`, `EmailVerificationToken`, `PairingToken`, `PasswordResetToken`, `SosAlert`, `Tarea`, `User`, `Vinculo`.

2. Los índices únicos existen:

   ```bash
   mongosh "$DATABASE_URL" --quiet --eval 'db.User.getIndexes().map(i => i.key)'
   mongosh "$DATABASE_URL" --quiet --eval 'db.Vinculo.getIndexes().map(i => i.key)'
   ```

   Debe figurar `email` como índice único en `User` y `codigo` como único en `Vinculo`.

3. El correo duplicado se rechaza: insertar dos veces el mismo `email` devuelve error de clave duplicada (E11000). Esa es la prueba de la restricción, no la lectura del esquema.

4. `npm run db:validate` termina sin errores.

## 6. Respaldo y restauración

- **Copia manual (cualquier plan):**

  ```bash
  mongodump --uri="$DATABASE_URL" --out=backup/$(date +%Y%m%d)
  mongorestore --uri="$DATABASE_URL" --drop backup/20251113
  ```

- **Plan gestionado con copias automáticas:** activar snapshots y fijar la retención. En planes gratuitos no existen: hay que programar `mongodump` fuera del proveedor.
- **Verificación obligatoria:** una copia no verificada no es una copia. Restaurar sobre una base de prueba y confirmar los conteos de `User` y `Dosificacion`.

## 7. Correspondencia con la aplicación

| Colección | Origen | Campos de la app (`mobile-app/src/modules/models.ts`) |
| --- | --- | --- |
| `Dosificacion` | App | `medicamento`, `dosis`, `horario` (`HH:MM`), `notas` |
| `Alerta` | App | `titulo`, `mensaje`, `nivel` (`informacion` \| `importante`), `fecha` (`AAAA-MM-DD`) |
| `Tarea` | App | `titulo`, `completada` |
| `Cita` | App | `titulo`, `medico`, `lugar`, `fecha` (`AAAA-MM-DD`), `hora` (`HH:MM`) |
| `Vinculo` | App | `codigo` (16 hex, único), `familiarId`, `seniorId` |
| `User` | Preservada | Cuentas. `role` validado en la capa de aplicación |
| `EmailVerificationToken`, `PasswordResetToken` | Preservada | Tokens de un solo uso, guardados como hash |
| `PairingToken` | Preservada | Vinculación por token; el QR de la app usa `Vinculo.codigo` |
| `Activity` | Preservada | Rutina diaria asignada por un cuidador |
| `SosAlert` | Preservada | Alerta de emergencia con posición GPS |

Las cuatro entidades nuevas agregan `seniorId` (adulto mayor destinatario) y `createdBy` (quien cargó el registro), tomados de la convención preservada. Son la base del filtrado por vínculo (HU-18), que hoy no existe porque la app persiste local.

## 8. Alternativa local con Docker

Solo para trabajar sin conexión o replicar la topología del despliegue:

```bash
docker compose up -d mongo mongo-rs-init
```

Publica `127.0.0.1:4301` y deja el replica set `rs0` iniciado. **No es la instancia externa**: es el reemplazo local de esa instancia. Requiere Docker instalado (hoy no está en el equipo de desarrollo).

## 9. Roles: valores canónicos y legado

`role` es un String validado, porque MongoDB no tiene enums nativos.

| Valor canónico (app) | Significado | Equivalencia en documentos antiguos |
| --- | --- | --- |
| `administrador` | Super usuario; rol no modificable | — |
| `adulto_mayor` | Persona acompañada | `SENIOR` |
| `cuidador` | Encargado que administra la información | `CAREGIVER` |
| `familiar` | Quien se vincula por QR | — |

No se reescriben documentos existentes: la traducción ocurre al leer. Si algún día se migran los datos, se hace con un script versionado y verificable, no a mano.

## 10. Fuera de alcance de este documento

- El código del servidor y su estructura en capas: slice S2.
- Endpoints de identidad y de datos: slices S3, S4 y S5.
- Datos de demostración: la siembra pertenece a HU-21 y **nunca** se ejecuta contra producción.
