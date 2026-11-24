# Skills del proyecto

Dos orígenes, una sola regla: se lee la skill antes de tocar el código que gobierna.

## vendor/ — 52 skills de terceros (copiadas y pineadas)

Snapshot copiado desde el repo de origen en el commit indicado. Sin `npx skills`, sin submodules y
sin descargas en tiempo de uso: el contenido está versionado acá y se lee sin red. Todos los commits
abajo son el HEAD del repo de origen al momento de copiar.

| Repo | Commit | Skills copiadas |
| --- | --- | --- |
| `agents-inc/skills` | `845a1f2833eedc494bb82e3172710c06cab547a1` | `api-database-mongoose`, `api-framework-express`, `mobile-framework-react-native`, `mobile-navigation-react-navigation`, `mobile-notifications-push`, `mobile-deep-linking-app-links`, `mobile-security-react-native`, `mobile-camera-vision-camera`, `mobile-storage-mmkv`, `mobile-storage-sqlite-powersync`, `mobile-background-tasks`, `mobile-performance-react-native`, `mobile-testing-maestro`, `web-realtime-socket-io`, `web-accessibility-web-accessibility`, `web-forms-zod-validation`, `web-utilities-date-fns`, `shared-security-auth-security`, `shared-tooling-typescript-config`, `meta-design-expressive-typescript`, `infra-ci-cd-docker` |
| `mongodb/agent-skills` | `180d6a3386c1d1dc44cdab300cc0f7ed0843c9e0` | `mongodb`, `mongodb-connection`, `mongodb-schema-design`, `mongodb-query-optimizer` |
| `iDiagoValeta/hexagonal-architecture` | `d15997cc094a1a2a7490fe4e0000f15b5d5025c0` | `hexagonal-architecture` (audita la dependency rule en el código) |
| `Jeffallan/claude-skills` | `d98d06edb54c25cfb94017c0ef830342a34a43ba` | `secure-code-guardian` (`plugin/skills/`) |
| `jaballer/react-claude-skills` | `a846192857412ba6a23b00f11343e6d48a317c55` | las 21 `react-*` |
| `anthropics/skills` | `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` | `frontend-design`, `skill-creator` |
| `mastepanoski/claude-skills` | `ac3023830834f9c7c181649f31fbfd48c91837d3` | `wcag-accessibility-audit` |
| `shawnmcb/claude-a11y-skills` | `0e793f1ef9b1dc788402a0109e79638eb83ee7b3` | `wcag-check` |

> No se vendoriza `capawesome-team/skills`: su colección `capacitor-plugins` son 244 páginas de
> referencia upstream y Capacitor salió del stack. Se consulta en línea cuando haga falta.

### Qué skill se usa para qué HU

| Necesidad | Skill | HU |
| --- | --- | --- |
| Schema, índices y queries en MongoDB | `mongodb-schema-design`, `mongodb-query-optimizer`, `api-database-mongoose` | todas |
| Respetar puertos y adaptadores | `hexagonal-architecture` | gate de cada HU |
| TypeScript estricto y funciones legibles | `shared-tooling-typescript-config`, `meta-design-expressive-typescript` | todas |
| JWT, bcrypt, CORS, OWASP | `secure-code-guardian`, `shared-security-auth-security` | 001, 003, 004 |
| API HTTP y validación | `api-framework-express`, `web-forms-zod-validation` | 001-004, 013-016 |
| Pantallas de React Native | `mobile-framework-react-native`, `mobile-navigation-react-navigation` | todas las de UI |
| Escanear el QR | `mobile-camera-vision-camera` | 009 |
| Guardar el token del dispositivo | `mobile-storage-mmkv` | 006, 009 |
| Cola offline y sync | `mobile-storage-sqlite-powersync` | 029, 030 |
| Recordatorios locales y push FCM | `mobile-notifications-push` | 018, 020, 028 |
| Ubicación y permisos | `mobile-background-tasks`, `mobile-storage-mmkv` | 027 |
| Alertas SOS en tiempo real | `web-realtime-socket-io` | 020, 026, 028 |
| Accesibilidad de la app del adulto mayor | `wcag-accessibility-audit`, `wcag-check`, `web-accessibility-web-accessibility` | 009, 018, 019, 023, 024, 025 |
| Zona horaria Bogotá | `web-utilities-date-fns` | 013, 015 |
| Endurecer el APK | `mobile-security-react-native` | 009, 025 |
| Tests de flujo en dispositivo | `mobile-testing-maestro` | todas |
| Empaquetar y desplegar | `infra-ci-cd-docker` | deploy |
| Formato de skills nuevas | `skill-creator` | proyecto |

## project/ — 10 reglas propias

Salen de las HU y de `docs/`; ninguna skill genérica las cubre. Nueve son recuperadas de
`25672da:skills/` — el código se borró en el reset, las decisiones no — y dos se escribieron desde
cero porque nunca existieron: `pairing-link` y `senior-ui-wcag`.

| Skill | Origen | Estado |
| --- | --- | --- |
| `auth-hexagonal` | recuperada | estructura objetivo, sin código todavía |
| `jwt-security` | recuperada | decidida |
| `rate-limiting` | recuperada | decidida (login y register siguen sin límite: deuda declarada) |
| `email-adapter` | recuperada | decidida |
| `ley-1581` | recuperada | decidida, con consentimiento por finalidad |
| `profiles-hexagonal` | recuperada | reanclada: vínculos múltiples y ficha médica |
| `pairing-generator` | recuperada | decidida |
| `qr-adapter` | recuperada | decidida |
| `pairing-link` | nueva | canje en el teléfono, sin PIN |
| `senior-ui-wcag` | nueva | 20pt, 48x48, WCAG 2.2 AA |

> `bcrypt-pin` se retiró: el anteproyecto prohíbe credenciales para el adulto mayor (decisión L3 de
> `docs/backlog.md`). No la reintroduzcas sin reabrir esa decisión.

## Cómo se actualiza

```bash
# re-vendorizar una skill concreta desde su repo, pineando el commit completo
git clone --depth 1 https://github.com/<owner>/<repo> /tmp/r
cp -r /tmp/r/<ruta>/<skill> .agents/skills/vendor/<skill>
git -C /tmp/r rev-parse HEAD        # anotar el SHA completo en la tabla de arriba
rm -rf /tmp/r
```

El SHA completo, no el corto: un prefijo de 7 caracteres no es un pin verificable.
