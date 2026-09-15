import { defineConfig } from 'prisma/config';

// Prisma 7 no carga `.env` por su cuenta. Se usa el soporte nativo de Node en lugar de `dotenv`;
// si no hay `.env` (CI, Docker), las variables llegan del entorno.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Opcional para `prisma generate`, que no necesita conexión.
    url: process.env.DATABASE_URL,
  },
});
