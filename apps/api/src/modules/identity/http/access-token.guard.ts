import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PersonalAccessTokenScope } from '@sol-a-sol/domain';

import { AuthenticatePersonalAccessToken } from '../application/personal-access-tokens.js';
import { looksLikePersonalAccessToken } from '../infrastructure/personal-access-token-value.js';
import { ACCESS_TOKENS, type AccessTokens } from '../ports/access-tokens.js';

const BEARER = 'Bearer ';

const ACCEPTED_SCOPE = Symbol('acceptedPersonalAccessTokenScope');

/**
 * Deja entrar a esa ruta con un **token personal** que tenga ese scope, además de con una sesión.
 *
 * Sin este decorador, una ruta protegida solo acepta el token de acceso de una sesión: un token
 * personal que llegue ahí recibe **403**. Así, el token del celular puede mandar capturas pero
 * no listar tokens, tocar el segundo factor ni nada de la cuenta.
 */
export const AcceptsPersonalAccessToken = (scope: PersonalAccessTokenScope) =>
  SetMetadata(ACCEPTED_SCOPE, scope);

/** Dónde queda el `userId` una vez comprobado el token. */
interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  userId?: string;
}

/**
 * Exige una credencial válida y deja el `userId` a mano de la ruta.
 *
 * Acepta dos: el token de acceso de una sesión (un JWT de 15 minutos), que puede todo lo que
 * puede su dueño, y un token personal (`sas_pat_…`), que solo puede lo que digan sus scopes y
 * solo en las rutas marcadas con `@AcceptsPersonalAccessToken`.
 *
 * Es la base del aislamiento por usuario: a partir de aquí, un caso de uso recibe **de quién**
 * es la petición en vez de creerse un identificador del cuerpo. La tarea 09 lo extiende a todos
 * los endpoints con sus pruebas anti-IDOR.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKENS) private readonly tokens: AccessTokens,
    private readonly personalAccessTokens: AuthenticatePersonalAccessToken,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenOf(request.headers.authorization);

    if (token === undefined) throw new UnauthorizedException();

    const userId = looksLikePersonalAccessToken(token)
      ? await this.personalAccessTokens.execute({
          token,
          requiredScope: this.acceptedScope(context),
          ip: request.ip,
          userAgent: userAgentOf(request.headers['user-agent']),
        })
      : await this.tokens.verify(token);
    if (userId === null) throw new UnauthorizedException();

    request.userId = userId;

    return true;
  }

  private acceptedScope(context: ExecutionContext): PersonalAccessTokenScope | null {
    return (
      this.reflector.getAllAndOverride<PersonalAccessTokenScope | undefined>(ACCEPTED_SCOPE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null
    );
  }
}

function bearerTokenOf(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string' || !header.startsWith(BEARER)) return undefined;

  const token = header.slice(BEARER.length).trim();

  return token === '' ? undefined : token;
}

function userAgentOf(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

/** El `userId` que dejó `AccessTokenGuard`. Solo tiene sentido en rutas que lo usen. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { userId } = context.switchToHttp().getRequest<AuthenticatedRequest>();

  if (userId === undefined) {
    // Un descuido de programación, no un fallo del cliente: la ruta se marcó con `@CurrentUser`
    // pero se olvidó el guard, y devolver `undefined` acabaría en una consulta sin filtrar.
    throw new Error('AccessTokenGuard no protege esta ruta: no hay usuario autenticado.');
  }

  return userId;
});
