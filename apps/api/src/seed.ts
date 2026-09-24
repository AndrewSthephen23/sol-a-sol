import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CatalogModule, SeedAccountsWithoutCategories } from './modules/catalog/index.js';

/**
 * `pnpm db:seed`: da las categorías iniciales a las cuentas que **no tienen ninguna**, y no toca
 * a las que ya tienen alguna. Se puede correr las veces que haga falta.
 *
 * Las cuentas nuevas reciben la semilla al registrarse; esto existe para las creadas antes de
 * que existiera, y para una cuenta a la que se le cayó la semilla al registrarse.
 *
 * Arranca solo el módulo del catálogo, sin servidor HTTP, y usa los mismos casos de uso que la
 * API: la semilla no tiene un segundo camino que pueda separarse del primero. Nunca corre sola:
 * en producción es un comando explícito (`node dist/seed.js`).
 */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CatalogModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const { seeded, skipped } = await app.get(SeedAccountsWithoutCategories).execute();
    Logger.log(
      `Semilla: ${String(seeded)} cuentas sembradas, ${String(skipped)} ya tenían categorías.`,
      'Seed',
    );
  } finally {
    await app.close();
  }
}

await seed();
