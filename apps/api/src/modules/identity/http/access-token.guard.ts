import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ACCESS_TOKENS, type AccessTokens } from '../ports/access-tokens.js';

const BEARER = 'Bearer ';

/** Dónde queda el `userId` una vez comprobado el token. */
interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  userId?: string;
}

/**
 * Exige un token de acceso válido y deja el `userId` a mano de la ruta.
 *
 * Es la base del aislamiento por usuario: a partir de aquí, un caso de uso recibe **de quién**
 * es la petición en vez de creerse un identificador del cuerpo. La tarea 09 lo extiende a todos
 * los endpoints con sus pruebas anti-IDOR.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKENS) private readonly tokens: AccessTokens) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenOf(request.headers.authorization);

    if (token === undefined) throw new UnauthorizedException();

    const userId = await this.tokens.verify(token);
    if (userId === null) throw new UnauthorizedException();

    request.userId = userId;

    return true;
  }
}

function bearerTokenOf(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string' || !header.startsWith(BEARER)) return undefined;

  const token = header.slice(BEARER.length).trim();

  return token === '' ? undefined : token;
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
