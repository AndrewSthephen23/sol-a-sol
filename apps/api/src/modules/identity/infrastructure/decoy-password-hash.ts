import { randomBytes } from 'node:crypto';

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { PASSWORD_HASHER, type PasswordHasher } from '../ports/password-hasher.js';

/**
 * Hash señuelo contra el que se verifica cuando el correo no existe.
 *
 * Sin él, un login contra un correo desconocido respondería sin hashear nada y sería
 * visiblemente más rápido que uno con la contraseña equivocada: cronometrando las respuestas se
 * podría averiguar qué correos tienen cuenta.
 *
 * Se calcula **al arrancar** el módulo, no en el primer fallo, porque si no ese primer intento
 * costaría un hash de más y volvería a delatar la diferencia. Es de una cadena aleatoria, así
 * que no hay ninguna contraseña que lo satisfaga.
 */
@Injectable()
export class DecoyPasswordHash implements OnModuleInit {
  private value = '';

  constructor(@Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher) {}

  async onModuleInit(): Promise<void> {
    this.value = await this.passwords.hash(randomBytes(32).toString('hex'));
  }

  get(): string {
    return this.value;
  }
}
