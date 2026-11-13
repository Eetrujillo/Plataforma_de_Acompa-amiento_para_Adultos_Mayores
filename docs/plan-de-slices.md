# Plan de slices — entrega por unidades revisables

**Propósito:** definir cómo se corta el trabajo en unidades que otra persona pueda revisar de verdad, aplicado a este repositorio y al backlog de `docs/historias-de-usuario.md`.

## 1. El problema que resuelve

La rama `dev-kevin` acumula **3.899 líneas autoradas en 23 commits** sobre `origin/main`. Un diff de ese tamaño no se revisa: se acepta. Aceptar sin revisar es peor que no tener revisión, porque da la ilusión de control y deja pasar defectos con firma de aprobación.

Un *slice* es la unidad más grande de cambio que una persona puede entender completa de una vez. Se aplica en dos niveles:

| Nivel | Unidad | Tamaño objetivo | Contenido |
| --- | --- | --- | --- |
| Commit | Unidad de trabajo | ~400 líneas autoradas | Una conducta con sus tests, sus docs y su mensaje |
| Pull request | Slice de entrega | 1 a 4 commits de la misma conducta | Una funcionalidad contable de punta a punta |

**Líneas autoradas** significa: `git diff --shortstat` descontando lockfiles, artefactos generados y binarios. Se mide con:

```bash
git diff --shortstat <base>..<slice>
```

La cifra de ~400 líneas no es estética: los estudios de revisión de código muestran que la detección de defectos cae abruptamente pasado cierto volumen, y que el revisor empieza a aprobar por cansancio en lugar de por convicción.

## 2. Política de slice (reglas obligatorias)

1. **Un slice = una conducta.** Si el título del slice necesita la palabra «y» para describir dos cosas independientes, son dos slices.
2. **El slice deja el repositorio en verde.** Tipos, lint y build pasan al final del slice. Un commit que deja el proyecto sin compilar no es un slice, es un punto de guardado.
3. **La app funciona al terminar el slice.** Un slice nunca deja media pantalla sin salida ni un flujo a medio conectar.
4. **Tests y documentación viajan con la conducta.** El test de una conducta va en el mismo commit que la conducta; el documento que la describe, también.
5. **Una rama por slice**, con base en el slice anterior cuando hay dependencia (PR encadenado) o en `dev` cuando es independiente.
6. **Sin mezcla de refactor y conducta.** Si hace falta refactorizar para implementar, se hace en el slice anterior o en uno propio; nunca dentro del mismo diff que agrega funcionalidad.
7. **El documento se actualiza en el slice, no después.** Cada cierre de slice actualiza `docs/ESTADO-SESION.md` con el commit que lo contiene.

### Definición de terminado de un slice

- [ ] Conducta implementada según su historia de usuario, con criterios de aceptación cubiertos.
- [ ] `tsc --noEmit`, `expo lint` y `expo export --platform web` en verde.
- [ ] Tests de la conducta escritos y pasando; un test prueba cada regla que la historia nombra.
- [ ] Prueba funcional en navegador o dispositivo según corresponda, con evidencia registrada.
- [ ] Documentación afectada actualizada (historia, estado de sesión, ayuda o mensajes).
- [ ] `git diff --shortstat` dentro del presupuesto (~400 líneas) o justificación explícita.
- [ ] Commit con mensaje Conventional Commit, en inglés.
- [ ] Historia marcada como cerrada en `docs/historias-de-usuario.md` con su commit.

## 3. Estado de partida: la deuda existente

No se reescribe la historia de la rama. Reescribir 23 commits para «ordenarlos» destruye trazabilidad y no aporta revisión real: nadie va a leer los commits viejos de nuevo.

**Decisión recomendada para el equipo**, una de dos:

| Opción | Cuándo conviene | Costo |
| --- | --- | --- |
| **A. Declarar un PR 0 de integración** que incluya la rama completa y documente en su descripción qué contiene y qué se verificó | El equipo acepta que la base ya está dada y quiere empezar a revisar desde la próxima historia | Bajo; requiere honestidad explícita sobre el tamaño |
| **B. Dividir el histórico en PRs derivados** con `git diff` por rutas (auth, módulos, QR, integración) | El equipo exige revisión efectiva de lo ya construido | Alto: trabajo de reclasificación sin cambiar código |

En cualquier caso, **el próximo commit no debe aumentar la deuda**. Todo lo que venga desde ahora entra por slice.

## 4. Mapa de slices

Cada slice corresponde a una o más historias del backlog. Los tamaños son estimaciones para planificar, no mediciones.

### S0 — Documentación de producto y entrega

- **Historias:** ninguna (soporte del proyecto)
- **Alcance:** `docs/historias-de-usuario.md`, `docs/ESTADO-SESION.md`, este plan.
- **Fuera de alcance:** cualquier cambio de código.
- **Cierre:** los tres documentos versionados, sin referencias desactualizadas.
- **Commits:** `d6f682e`, `54f338d` y el presente.
- **Base:** `dev-kevin`. **Rama:** `dev-kevin` (ya existe).
- **Tamaño:** ~600 líneas (documentación exenta del presupuesto de código).

### S1 — Crear y aprovisionar la base de datos externa (HU-01)

- **Alcance:** infraestructura de datos y esquema: `backend/prisma/schema.prisma` (modelos de usuario, rol, adulto mayor, dosificación, alerta, tarea, cita, vínculo), migración inicial, usuario de aplicación con permisos mínimos, entornos separados, `backend/docs/database.md` con el procedimiento y la restauración de respaldo.
- **Fuera de alcance:** endpoints, conexión en tiempo de ejecución (eso es S2), cualquier cambio en `mobile-app/`.
- **Cierre:** una instancia nueva queda operativa solo ejecutando las migraciones; el correo es único a nivel de esquema; el documento permite restaurar una copia.
- **Verificación:** aplicar migraciones sobre una instancia limpia; intentar insertar un correo duplicado y confirmar el rechazo; restaurar una copia de respaldo.
- **Depende de:** nada. **Base:** `dev`. **Rama:** `feat/database-provisioning`.
- **Tamaño estimado:** ~350 líneas (schema + migración generada + documentación).

### S2 — Conectar el backend con la base de datos (HU-02)

- **Alcance:** cliente de base de datos, lectura de credenciales por variables de entorno, `backend/.env.example`, verificación de salud (`/health` o equivalente), arranque y cierre ordenados, registro de errores sin exponer credenciales.
- **Fuera de alcance:** modelo de datos (S1), endpoints de negocio (S3).
- **Cierre:** el backend arranca contra la instancia externa, informa el estado de la conexión y no expone credenciales en logs ni en respuestas.
- **Verificación:** arranque con base disponible y con la conexión cortada; revisar que los logs no contengan la cadena de conexión; rotar la credencial sin tocar código.
- **Depende de:** S1. **Base:** S1. **Rama:** `feat/database-connection`.
- **Tamaño estimado:** ~250 líneas.

### S3 — Contrato de servicios y API de identidad (HU-09, primera parte)

- **Alcance:** contrato HTTP de identidad (registro, login, sesión) en `backend/`, y adaptación de `mobile-app/src/services/auth.ts` para consumirlo detrás de la misma interfaz pública que usa la app hoy. Sin cambios de pantallas.
- **Fuera de alcance:** datos del adulto mayor; migración de los módulos CRUD (S4 y S5); rediseño de interfaces de usuario.
- **Cierre:** registro y login funcionan contra la base externa; las pantallas no cambian porque el contrato del servicio se conserva; el almacenamiento local deja de ser fuente de verdad para la identidad.
- **Verificación:** registro nuevo persiste en la base; credenciales incorrectas rechazan sin crear sesión; sesión expirada se trata como ausencia de sesión; test de contrato del servicio.
- **Depende de:** S2. **Base:** S2. **Rama:** `feat/identity-api`.
- **Tamaño estimado:** ~400 líneas (es el slice más delicado: toca autenticación).

### S4 — Datos del cuidado: dosificación y citas (HU-09, segunda parte; HU-11, HU-12)

- **Alcance:** endpoints y persistencia de dosificaciones y citas; adaptación de `mobile-app/src/services/collections.ts` para esas dos entidades; migración de sus pantallas sin cambiar la experiencia.
- **Fuera de alcance:** alertas y tareas (S5); filtrado por vínculo (S6).
- **Cierre:** crear, editar y eliminar una dosificación y una cita deja el dato en la base externa y se recupera desde otro dispositivo.
- **Verificación:** CRUD completo de ambas entidades en navegador; recarga y segundo navegador con la misma cuenta; borrado en dos pasos; campos obligatorios vacíos rechazados.
- **Depende de:** S3. **Base:** S3. **Rama:** `feat/care-data-api`.
- **Tamaño estimado:** ~400 líneas.

### S5 — Datos del cuidado: alertas y tareas (HU-09, tercera parte; HU-13, HU-14)

- **Alcance:** endpoints y persistencia de alertas y tareas; adaptación del almacén compartido y de sus dos pantallas.
- **Fuera de alcance:** cualquier cambio en dosificación y citas.
- **Cierre:** las cuatro entidades operan contra la base externa; `collections.ts` deja de ser un almacén local como fuente de verdad.
- **Verificación:** CRUD de alertas y tareas; el estado de completado persiste; las cuatro pantallas siguen funcionando después del cambio.
- **Depende de:** S4. **Base:** S4. **Rama:** `feat/alerts-tasks-api`.
- **Tamaño estimado:** ~350 líneas.

### S6 — Ver solo la información del vínculo (HU-18)

- **Alcance:** filtrado por vínculo en el backend (alcance de datos por usuario), adaptación del panel, mensaje y acción cuando no hay vínculo activo, vista global para administrador.
- **Fuera de alcance:** cambios en la generación o lectura del QR (HU-15 y HU-16 ya están).
- **Cierre:** dos cuentas vinculadas a adultos mayores distintos no ven datos ajenos; el administrador conserva la vista global.
- **Verificación:** prueba con dos vínculos distintos y una cuenta administrador; sin vínculo activo se informa y se ofrece la vinculación por QR.
- **Depende de:** S5 y HU-16. **Base:** S5. **Rama:** `feat/data-scoping-by-link`.
- **Tamaño estimado:** ~300 líneas.

### S7 — Validar el escaneo en dispositivo físico (HU-17)

- **Alcance:** ninguna línea de código. Evidencia de prueba: capturas, resultados de ambos flujos, defectos encontrados y su corrección en su propio slice.
- **Cierre:** los cuatro criterios de HU-17 verificados y registrados.
- **Depende de:** HU-16 (ya implementada). **Base:** la que esté en revisión.
- **Tamaño:** cero líneas de código; la evidencia se adjunta al PR o al documento de estado.

### S8 — Contenidos definitivos (HU-22)

- **Alcance:** `mobile-app/src/content.ts` con el contenido aprobado por el cliente.
- **Cierre:** sin marcadores de posición; revisado en web y móvil.
- **Depende de:** material del cliente. **Base:** `dev`. **Rama:** `docs/final-content`.
- **Tamaño estimado:** menos de 100 líneas.

## 5. Secuencia

```
dev-kevin (S0, ya integrado)
   └── S1 base de datos        ── requiere nada
        └── S2 conexión       ── requiere S1
             └── S3 identidad ── requiere S2
                  └── S4 dosificación y citas ── requiere S3
                       └── S5 alertas y tareas ── requiere S4
                            └── S6 filtrado por vínculo ── requiere S5
S7 evidencia de escaneo: cuando haya dispositivo disponible, contra la base en revisión
S8 contenidos: cuando el cliente entregue el material
```

S1 a S6 son **PRs encadenados**: cada uno apunta a la rama del anterior. Se revisan en orden y, al mergearse uno, el siguiente se rebasa sobre `dev`. Nunca hay un PR gigante esperando turno.

## 6. Convención de ramas y commits

- **Ramas:** `feat/<conducta-en-ingles>`, `fix/<conducta>`, `docs/<tema>`. Sin iniciales, sin fechas, sin `wip`.
- **Commits:** Conventional Commits en inglés, alcance por área cuando aporta claridad: `feat(api): expose identity endpoints`, `feat(db): add provisioned schema and migrations`, `docs: …`.
- **Prohibido en un slice:** `wip`, `stuff`, `fix`, `changes`, `varios`, y cualquier mensaje que no diga qué conducta cambia.
- **Un commit por slice** cuando el slice es pequeño; hasta cuatro cuando el slice tiene partes verificables por separado, siempre dentro del mismo PR.

## 7. Riesgos del slicing (cómo se hace mal)

| Error | Por qué duele | Cómo evitarlo |
| --- | --- | --- |
| **Slice horizontal** («todos los modelos», «todos los tests») | Parece pequeño y ordenado, pero no entrega nada funcionando y rompe la regla 3 | Cortar por conducta de usuario, no por capa técnica |
| **Slice que no compila solo** | Bloquea al revisor y a cualquier rama encadenada | Verificar en verde al cerrar cada slice |
| **Slice disfrazado** («refactor + feature») | El revisor no distingue lo que hay que revisar de lo que solo se movió | Refactor en slice propio o previo |
| **Slice de 2 líneas** | Ruido de PRs y trabajo de coordinación sin beneficio | Agrupar conductas del mismo flujo |
| **PR huérfano** | Queda abierto mientras la base cambia y hay que rebasar mil veces | Encadenar y mergear en orden |

## 8. Plantilla de PR por slice

```markdown
## Qué cambia
<una frase: la conducta, no los archivos>

## Historia
HU-XX — <título> (docs/historias-de-usuario.md)

## Cómo se verificó
- [ ] tsc --noEmit
- [ ] expo lint
- [ ] expo export --platform web
- [ ] prueba funcional: <qué se hizo>
- [ ] evidencia: <capturas o pasos>

## Fuera de alcance
<lo que este PR no hace, para que el revisor no lo busque>

## Riesgo
<ítem de riesgo o «ninguno», con motivo>

## Tamaño
git diff --shortstat <base>..<slice> → N líneas autoradas
```

## 9. Registro de slices

| Slice | Historias | Rama | Base | Estado |
| --- | --- | --- | --- | --- |
| S0 Documentación | — | `dev-kevin` | `dev` | Contenido listo, push a `dev-kevin`; PR a `dev` pendiente de decisión |
| S1 Base de datos | HU-01 | `feat/database-provisioning` | `dev` | No iniciado |
| S2 Conexión | HU-02 | `feat/database-connection` | S1 | No iniciado |
| S3 Identidad | HU-09 (1/3) | `feat/identity-api` | S2 | No iniciado |
| S4 Dosificación y citas | HU-09 (2/3), HU-11, HU-12 | `feat/care-data-api` | S3 | No iniciado |
| S5 Alertas y tareas | HU-09 (3/3), HU-13, HU-14 | `feat/alerts-tasks-api` | S4 | No iniciado |
| S6 Filtrado por vínculo | HU-18 | `feat/data-scoping-by-link` | S5 | No iniciado |
| S7 Evidencia de escaneo | HU-17 | — | — | No iniciado (requiere dispositivo) |
| S8 Contenidos | HU-22 | `docs/final-content` | `dev` | Bloqueado por el cliente |

Las ramas se crean al iniciar cada slice, no antes: una rama vacía no es planificación, es ruido.
