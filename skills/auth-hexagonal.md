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
        └── prismaUserRepository.js # Adaptador de Prisma para MongoDB
