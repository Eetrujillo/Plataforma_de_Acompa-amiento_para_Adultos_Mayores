# Skills del proyecto

Dos orígenes, una sola regla: se lee la skill antes de tocar el código que gobierna.

## vendor/ — 60 skills de terceros (copiadas y pineadas)

Snapshot copiado desde el repo de origen en el commit indicado. Sin `npx skills`, sin submodules:
el contenido está versionado acá y se lee sin depender de la red.

| Repo | Commit | Fecha | Skills copiadas |
| --- | --- | --- | --- |
| `prisma/skills` | `a6f1929` | 2026-11-09 | `prisma-orm-setup`, `prisma-client-api`, `prisma-database-setup`, `prisma-mongodb-upgrade` |
| `mongodb/agent-skills` | `180d6a3` | 2026-11-23 | `mongodb`, `mongodb-connection`, `mongodb-schema-design`, `mongodb-query-optimizer` |
| `iDiagoValeta/hexagonal-architecture` | `d15997c` | 2026-11-18 | `hexagonal-architecture` (audita la dependency rule en el código) |
| `Jeffallan/claude-skills` | `d98d06e` | 2026-11-23 | `secure-code-guardian` (`plugin/skills/`) |
| `jaballer/react-claude-skills` | `a846192` | 2026-06-22 | las 21 `react-*` |
| `agents-inc/skills` | `845a1f2` | 2026-10-27 | `web-pwa-offline-first`, `web-pwa-service-workers`, `web-realtime-socket-io`, `web-maps-leaflet`, `web-forms-zod-validation`, `web-routing-react-router`, `web-accessibility-web-accessibility`, `shared-security-auth-security`, `web-utilities-date-fns`, `api-framework-express`, `infra-ci-cd-docker` |
| `anthropics/skills` | `e4bb5d9` | 2026-11-16 | `frontend-design`, `skill-creator` |
| `mastepanoski/claude-skills` | `ac30238` | 2026-10-29 | `wcag-accessibility-audit` |
| `shawnmcb/claude-a11y-skills` | `0e793f1` | 2026-07-08 | `wcag-check` |
| `capawesome-team/skills` | `847d536` | 2026-11-19 | `capacitor-expert`, `capacitor-plugins`, `capacitor-react`, `capacitor-app-creation`, `capacitor-push-notifications`, `capacitor-platforms` |
| `Cap-go/capgo-skills` | `e82217b` | 2026-11-12 | `capacitor-offline-first`, `capacitor-accessibility`, `capacitor-best-practices`, `capacitor-security`, `capacitor-testing`, `capacitor-deep-linking`, `safe-area-handling`, `webapp-to-capacitor` |

### Qué skill se usa para qué HU

| Necesidad | Skill | HU |
| --- | --- | --- |
| Schema Prisma/Mongo, queries | `prisma-*`, `mongodb-schema-design`, `mongodb-query-optimizer` | todas |
| Respetar ports & adapters | `hexagonal-architecture` | gate de cada HU |
| JWT, bcrypt, CORS, OWASP | `secure-code-guardian`, `shared-security-auth-security` | 001, 003, 004, 011 |
| Registro, verificación, reset | `api-framework-express` | 001-004 |
| Componentes y pantallas web | `react-component-design`, `react-forms-validation`, `react-routing`, `react-styling` | 012-022 |
| Accesibilidad de la app móvil | `wcag-accessibility-audit`, `wcag-check`, `capacitor-accessibility` | 007, 008, 017, 018, 023 |
| Offline y cola de sync | `web-pwa-offline-first`, `capacitor-offline-first` | 019, 024 |
| Alertas SOS en tiempo real | `web-realtime-socket-io` | 026, 027 |
| Mapa con la ubicación del SOS | `web-maps-leaflet` | 030 |
| Notificaciones locales y push | `capacitor-push-notifications` | 016, 025 |
| Zona horaria Bogotá | `web-utilities-date-fns` | 012 |
| Empaquetar el APK | `capacitor-app-creation`, `webapp-to-capacitor`, `capacitor-expert` | 007 |
| Formato de skills nuevas | `skill-creator` | proyecto |

## project/ — 11 reglas propias

Salen de las HU y de `docs/`; ninguna skill genérica las cubre. 9 son recuperadas de
`25672da:skills/` (código borrado, decisión intacta) y 2 se escribieron desde cero porque nunca
existieron: `pairing-link` y `senior-ui-wcag`.

| Skill | Origen | Estado |
| --- | --- | --- |
| `auth-hexagonal` | recuperada | estructura objetivo, sin código todavía |
| `jwt-security` | recuperada | decidida |
| `rate-limiting` | recuperada | decidida (login y register siguen sin límite: deuda declarada) |
| `email-adapter` | recuperada | decidida |
| `ley-1581` | recuperada | decidida |
| `bcrypt-pin` | recuperada | decidida |
| `profiles-hexagonal` | recuperada | decidida |
| `pairing-generator` | recuperada | decidida |
| `qr-adapter` | recuperada | decidida |
| `pairing-link` | nueva | escrita desde HU-007 + `docs/pairing-api.md` |
| `senior-ui-wcag` | nueva | escrita desde HU-007/008/017/018/023 + reglas del proyecto |

## Cómo se actualiza

```bash
# re-vendorizar una skill concreta desde su repo
git clone --depth 1 https://github.com/<owner>/<repo> /tmp/r
cp -r /tmp/r/<ruta>/<skill> .agents/skills/vendor/<skill>
rm -rf /tmp/r
# actualizar el commit en la tabla de arriba
```
