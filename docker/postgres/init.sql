-- Se ejecuta solo al crear el volumen de datos por primera vez (docker-entrypoint-initdb.d).
-- Las extensiones que el modelo de datos necesite de verdad deben ir en una migración de Prisma,
-- para que existan también en pruebas (Testcontainers) y en producción.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
