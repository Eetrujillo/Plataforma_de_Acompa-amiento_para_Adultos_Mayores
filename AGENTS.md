# Plataforma de Acompañamiento para Adultos Mayores

App de acompañamiento para adultos mayores: panel web del **cuidador** + app móvil Android del
**adulto mayor**, con rutinas diarias, alertas SOS con GPS y vinculación por QR.

## Estado actual del repositorio

El repo está en **reconstrucción desde cero**. El commit `b3a6b0a` redujo el árbol de 241 a 12
archivos: sobrevive el despliegue y el modelo de datos, y se borró todo el código fuente.

- **Existe:** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` + `nginx.conf`
  (estos dos últimos quedaron fuera de alcance), workflow de deploy, `backend/prisma/schema.prisma`
  (6 modelos, referencia de datos a traducir a Mongoose), plantillas de entorno, `docs/` (contratos
  HTTP), `.agents/skills/`.
- **No existe todavía:** `backend/package.json`, `backend/src/`, ni el proyecto React Native.
  **La aplicación no compila.**
- **Punto de recuperación:** el código anterior vive en la historia, en `25672da` y anteriores
  (`git show 25672da:backend/src/...`). Es consulta, no base: el rewrite no hereda esa estructura.

## Stack

| Capa | Tecnología |
| --- | --- |
| Lenguaje | **TypeScript estricto** en todo el proyecto. `any` prohibido salvo justificación escrita. |
| Backend | Node.js 20+ + Express 4 en `3500`, Vertical Slicing sobre Hexagonal (puertos y adaptadores) |
| Datos | MongoDB 7 (replica set `rs0`) con **Mongoose**. Prisma queda descartado: v7 no tiene conector MongoDB. |
| Cliente | **React Native** — dos APK Android: adulto mayor, y familiar/cuidador con panel dual |
| Realtime | Socket.IO 4 (avisos de aprobación, alertas de omisión, SOS) |
| Push | Firebase Cloud Messaging (plan gratuito) |
| Mapas | `react-native-maps` sobre teselas de OpenStreetMap |
| HTTP | Axios en los clientes; JWT + bcrypt para autenticación |
| Deploy | Docker Compose en VPS; nginx 1.27 **solo proxy inverso de la API** |
| CI/CD | GitHub Actions con despliegue por SSH; pruebas con el Node Test Runner |

Fuente de verdad del stack: `anteproyecto` (documento de entrega), no este archivo. Si los dos
difieren, gana el anteproyecto y este archivo se corrige.

**No hay aplicación web.** La entrega son dos APK. El antiguo contenedor `frontend/` (Vite + nginx
sirviendo una SPA en `3201`) quedó fuera del alcance y está pendiente de retiro junto con su servicio
en `docker-compose.yml`.

## Los dos clientes son dos aplicaciones

Una sola base de código React Native, dos binarios **que no comparten pantallas**:

- **Familiar/cuidador** — registro y sesión, panel dual con varios familiares por adulto mayor y
  permisos equivalentes, perfil y ficha médica, generación y regeneración de QR, red de cuidadores y
  reasignación, creación y aprobación de actividades, bitácora, centro de alertas SOS con mapa.
- **Adulto mayor** — rutina del día, confirmación de actividades, bitácora visible, botón Llamar,
  SOS con presión sostenida, tarjeta de auxilio médico en pantalla, ubicación. Regido por la skill
  `senior-ui-wcag`: texto mínimo 20pt, áreas táctiles 48x48 CSS px, **cero credenciales**, sesión
  persistente.

Comparten TypeScript, el cliente HTTP y los modelos de dominio; **no comparten componentes de UI ni
navegación**. El ruteo es `react-navigation`, con un navegador raíz por binario.

## Skills: dónde viven y cómo se usan

Pi descubre skills de proyecto en `.agents/skills/` (recursivo, subiendo desde el directorio de
trabajo hasta la raíz del repo).

```
.agents/skills/
├── vendor/    60 skills de terceros, copiadas y pineadas (ver README con repo + commit)
└── project/   11 reglas nuestras, derivadas de las HU y de docs/
```

Regla de uso: **se lee la skill antes de tocar el código que gobierna**, no después. El inventario
completo con origen, commit y HU cubierta está en `.agents/skills/README.md`.

Las skills de `project/` son obligatorias, no sugerencias:

| Skill | Gobierna |
| --- | --- |
| `auth-hexagonal` | estructura del módulo auth |
| `jwt-security` | sesión, claims, bloqueo, cierre por versión |
| `rate-limiting` | límites por ventana móvil |
| `email-adapter` | puerto de correo, smtp/console |
| `ley-1581` | consentimiento y evidencia legal |
| `bcrypt-pin` | PIN de 4 dígitos |
| `profiles-hexagonal` | slice de perfiles seniors |
| `pairing-generator` | emisión del token/QR |
| `qr-adapter` | payload y presentación del QR |
| `pairing-link` | canje en el teléfono |
| `senior-ui-wcag` | accesibilidad de la app del adulto mayor |

## Flujo de trabajo

Cada tarea vive en su propia rama. **Nada se commitea directo en `main` ni en `prod`.**

1. Rama desde `main`: `hu-00X-<slug>` para una HU, `fix/<slug>` o `feat/<slug>` para lo demás.
2. Implementación con criterio de aceptación observable por delante.
3. Antes de integrar, en verde y con la salida real a la vista:
   - `cd backend && npm test`
   - `cd frontend && npm run build`
   - criterios de aceptación de la HU, uno por uno, verificados de verdad.
4. Merge a la rama de integración **solo** si los tres puntos anteriores pasaron.
5. Promoción a `prod` con confirmación explícita del humano. Es el único paso que toca el VPS.

> Mientras la app no compile, **ningún push a `prod`**: el workflow hace `docker compose up --build`
> y fallaría el deploy.

## Base de datos

La base de los contenedores es la del VPS y es la fuente de verdad. Cualquier prueba que escriba
datos usa prefijo identificable (`chk-`, `e2e-`, `smoke-`) y limpia al terminar. Prohibido contra la
base desplegada: borrados masivos, `db drop`, `prisma db push` sobre colecciones existentes.

## Reglas duras

- Un secreto nunca se commitea: `.env` está ignorado. Sin `JWT_SECRET` en producción el backend no
  arranca, y es a propósito.
- El adulto mayor nunca escribe credenciales. Ni una vez.
- Un perfil de otro cuidador responde `404`, nunca `403`: un `403` confirma que el id existe.
- Los tokens (verificación, reset, pairing, dispositivo) se guardan hasheados; el valor en claro
  viaja solo en el correo o dentro del QR.
- La evidencia de consentimiento de la Ley 1581 se guarda en el servidor, no en el cliente.

## Documentación

`docs/` tiene los contratos HTTP y de configuración ya decididos: `auth-api.md`, `pairing-api.md`,
`seniors-api.md`, `error-handling.md`, `google-signin.md`, `smtp-setup.md`, y `backlog.md` con las
30 HU en 3 sprints.
