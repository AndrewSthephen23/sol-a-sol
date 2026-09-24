import { Inject, Injectable } from '@nestjs/common';

import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';

/**
 * Ids de todas las cuentas. Es la única forma en que otro módulo recorre las cuentas: sale por la
 * API pública, y a propósito no trae ni el correo ni nada de las credenciales.
 *
 * Lo usa `pnpm db:seed` para dar las categorías iniciales a las cuentas que no tienen ninguna.
 */
@Injectable()
export class ListAccountIds {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(): Promise<string[]> {
    return this.users.listIds();
  }
}
