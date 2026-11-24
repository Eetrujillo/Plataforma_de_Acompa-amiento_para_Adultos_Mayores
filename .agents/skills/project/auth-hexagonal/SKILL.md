---
name: auth-hexagonal
description: Estructura obligatoria del módulo auth en Vertical Slice + Hexagonal (domain/application/infrastructure), entidad User, casos de uso y adaptadores. Usar al crear o tocar backend/src/modules/auth/.
---

> Recuperado de `25672da:skills/auth-hexagonal.md`. Las rutas que nombra son la estructura objetivo
> del rewrite, todavía no escrita.

# 🛠️ Skill: Arquitectura Hexagonal para Módulo Auth

## Estructura de Directorios Obligatoria (`backend/src/modules/auth/`)
```text
backend/src/modules/auth/
├── domain/
│   ├── User.js          # Entidad de dominio con reglas de negocio (ej. password >= 8 chars)
│   └── valueObjects/    # Value Objects (Email, Password cifrada)
├── application/
│   └── RegisterCaregiverUseCase.js # Caso de uso puro de registro
└── infrastructure/
    ├── http/
    │   └── authController.js       # Controlador Express (POST /api/auth/register)
    └── persistence/
        └── mongooseUserRepository.ts # Adaptador de Mongoose para MongoDB
