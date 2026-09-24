import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { USER_REGISTERED, type UserRegistered } from '../../identity/index.js';
import { SeedDefaultCategories } from '../application/default-categories.js';

/**
 * Da las categorías iniciales a cada cuenta nueva (decisión 4 de H3). Escucha el evento de
 * registro: `identity` no sabe que este módulo existe (ADR-0004).
 *
 * Siembra aunque `FEATURE_CATALOG` esté apagado: el flag decide qué se expone, no qué datos
 * existen, y así una cuenta creada con el catálogo apagado ya tiene sus categorías al encenderlo.
 *
 * Si falla, `@OnEvent` lo registra y el registro sigue: la cuenta ya existe, y `pnpm db:seed`
 * siembra después las cuentas que se quedaron sin categorías.
 */
@Injectable()
export class DefaultCategoriesOnRegistration {
  constructor(private readonly seed: SeedDefaultCategories) {}

  @OnEvent(USER_REGISTERED)
  async handle(event: UserRegistered): Promise<void> {
    await this.seed.execute(event.userId);
  }
}
