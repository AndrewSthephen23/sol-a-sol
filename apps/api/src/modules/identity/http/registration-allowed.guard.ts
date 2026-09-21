import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isRegistrationAllowed, toRegistrationMode } from '@sol-a-sol/domain';

import { USER_REPOSITORY, type UserRepository } from '../ports/user-repository.js';

/**
 * Deja pasar el registro solo según `REGISTRATION_MODE`.
 *
 * Cuando no está permitido responde **404**, exactamente igual que una ruta que no existe: un
 * 403 o un mensaje propio confirmarían que el registro está ahí, solo que cerrado.
 */
@Injectable()
export class RegistrationAllowedGuard implements CanActivate {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // El guard corre antes que el pipe de validación, así que el cuerpo llega todavía sin validar.
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();

    const allowed = isRegistrationAllowed({
      mode: toRegistrationMode(process.env.REGISTRATION_MODE),
      hasAnyUser: await this.users.hasAnyUser(),
      providedInvite: inviteCodeOf(request.body),
      expectedInvite: process.env.REGISTRATION_INVITE_CODE,
    });

    if (!allowed) throw new NotFoundException();

    return true;
  }
}

function inviteCodeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('inviteCode' in body)) return undefined;
  const { inviteCode } = body;

  return typeof inviteCode === 'string' ? inviteCode : undefined;
}
