import { DomainError } from '../errors/domain-error.js';
import type { Clock } from '../time/clock.js';

/**
 * Permisos que puede llevar un token personal.
 *
 * Empieza con uno solo: el celular necesita **mandar capturas** y nada más. Un token con este
 * scope no puede leer transacciones ni tocar la cuenta, así que perder el teléfono no expone las
 * finanzas. Un scope nuevo se agrega aquí cuando haga falta, no antes.
 */
export const PERSONAL_ACCESS_TOKEN_SCOPES = ['captures:write'] as const;

export type PersonalAccessTokenScope = (typeof PERSONAL_ACCESS_TOKEN_SCOPES)[number];

/** Un token siempre caduca: un token olvidado en un teléfono viejo tiene que dejar de servir solo. */
export const PERSONAL_ACCESS_TOKEN_DEFAULT_TTL_DAYS = 90;
export const PERSONAL_ACCESS_TOKEN_MIN_TTL_DAYS = 1;
export const PERSONAL_ACCESS_TOKEN_MAX_TTL_DAYS = 365;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export class UnknownTokenScopeError extends DomainError {
  readonly code = 'UNKNOWN_TOKEN_SCOPE';

  constructor() {
    super('A personal access token needs at least one scope, and every scope must exist.');
  }
}

export class InvalidTokenLifetimeError extends DomainError {
  readonly code = 'INVALID_TOKEN_LIFETIME';

  constructor() {
    super(
      `A personal access token must last between ${String(PERSONAL_ACCESS_TOKEN_MIN_TTL_DAYS)} ` +
        `and ${String(PERSONAL_ACCESS_TOKEN_MAX_TTL_DAYS)} whole days.`,
    );
  }
}

export function isPersonalAccessTokenScope(scope: string): scope is PersonalAccessTokenScope {
  return (PERSONAL_ACCESS_TOKEN_SCOPES as readonly string[]).includes(scope);
}

/**
 * Valida los scopes pedidos al crear un token.
 *
 * Uno desconocido se **rechaza** en vez de ignorarse: suele ser un error de tipeo, y aceptarlo en
 * silencio daría un token que no sirve para lo que su dueño cree. Los repetidos se quitan.
 */
export function toPersonalAccessTokenScopes(scopes: readonly string[]): PersonalAccessTokenScope[] {
  if (scopes.length === 0 || !scopes.every(isPersonalAccessTokenScope)) {
    throw new UnknownTokenScopeError();
  }

  return [...new Set(scopes)];
}

/**
 * Si un token con esos scopes puede hacer lo que pide la ruta.
 *
 * Coincidencia exacta, sin comodines: lo guardado en la base es texto, y un scope que ya no
 * existe no debe conceder nada.
 */
export function grantsScope(
  granted: readonly string[],
  required: PersonalAccessTokenScope,
): boolean {
  return granted.includes(required);
}

/**
 * Cuándo caduca un token creado ahora: entre 1 y 365 días enteros, **90 por defecto**.
 *
 * Nunca "sin caducidad" (decisión del autor): la comodidad de no renovarlo no compensa un token
 * que vive para siempre en un teléfono que ya nadie usa.
 */
export function personalAccessTokenExpiresAt(
  clock: Clock,
  days: number = PERSONAL_ACCESS_TOKEN_DEFAULT_TTL_DAYS,
): Date {
  if (
    !Number.isInteger(days) ||
    days < PERSONAL_ACCESS_TOKEN_MIN_TTL_DAYS ||
    days > PERSONAL_ACCESS_TOKEN_MAX_TTL_DAYS
  ) {
    throw new InvalidTokenLifetimeError();
  }

  return new Date(clock.now().getTime() + days * MILLISECONDS_PER_DAY);
}
