# Plataforma de Acompañamiento para Adultos Mayores

## Stack local

El proyecto contiene un backend Node.js/Express conectado a PostgreSQL. El frontend queda reducido a la configuración del cliente API para implementarse posteriormente.

```bash
docker compose up --build
```

Servicios disponibles:

- Backend: `http://localhost:3500`
- Salud y conexión PostgreSQL: `http://localhost:3500/api/health`
- PostgreSQL: `localhost:4301`

La variable `DATABASE_URL` se configura en `.env`. El esquema inicial está en `backend/database/init.sql` y el backend también garantiza su creación de forma idempotente al iniciar.
