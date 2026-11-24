---
name: ley-1581
description: Cumplimiento de la Ley 1581 de 2012: consentimiento explícito, campos acceptedTermsAt/termsVersion/ipAddress, rechazo HTTP 400 sin consentimiento, y por qué el titular es el adulto mayor. Usar en HU-001, HU-007, HU-009, HU-025 y HU-027.
---

> Recuperado de `25672da:skills/ley-1581.md`. Las rutas que nombra son la estructura objetivo
> del rewrite, todavía no escrita.

# 🛠️ Skill: Cumplimiento Ley 1581 de 2012 (Habeas Data)

## Reglas Obligatorias para Tratamiento de Datos Personales y Sensibles:
1. **Consentimiento Explícito:** Ningún usuario (familiar o adulto mayor) puede completar su registro o vinculación sin que el sistema registre de forma inalterable su aceptación de términos.
2. **Campos de Auditoría requeridos en Base de Datos (Prisma):**
   - `acceptedTermsAt` (DateTime): Marca de tiempo exacta del momento en que aceptó.
   - `termsVersion` (String): Versión de la política de tratamiento de datos aceptada (ej: `"1.0"`).
   - `ipAddress` (String, opcional): Dirección IP desde donde otorgó el consentimiento.
3. **Respuesta ante rechazo:** Si el cliente no envía la bandera de aceptación de términos (`acceptedTerms: true`), el backend debe rechazar la solicitud inmediatamente con un **HTTP 400 Bad Request** indicando que el consentimiento es obligatorio.
