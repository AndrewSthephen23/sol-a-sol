import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  grantsScope,
  hasExpired,
  type PersonalAccessTokenScope,
  personalAccessTokenExpiresAt,
  toPersonalAccessTokenScopes,
} from '@sol-a-sol/domain';

import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  InsufficientTokenScopeError,
  InvalidPersonalAccessTokenError,
  PersonalAccessTokenNotFoundError,
} from '../domain/errors.js';
import {
  createPersonalAccessTokenSecret,
  formatPersonalAccessToken,
  parsePersonalAccessToken,
  secretMatches,
} from '../infrastructure/personal-access-token-value.js';
import { AUDIT_LOGGER, type AuditLogger } from '../ports/audit-logger.js';
import {
  PERSONAL_ACCESS_TOKEN_REPOSITORY,
  type PersonalAccessTokenRepository,
  type PersonalAccessTokenSummary,
  type StoredPersonalAccessToken,
} from '../ports/personal-access-token-repository.js';

const ENTITY = 'personal_access_token';

/** De dónde vino la petición, para la bitácora. */
export interface RequestOrigin {
  ip?: string;
  userAgent?: string;
}

export interface CreatePersonalAccessTokenInput extends RequestOrigin {
  userId: string;
  name: string;
  scopes: string[];
  /** Si no llega, el dominio aplica sus 90 días. */
  expiresInDays?: number;
}

export interface CreatedPersonalAccessToken extends PersonalAccessTokenSummary {
  /** El valor en claro. Es la **única** vez que existe fuera del dispositivo que lo reciba. */
  token: string;
}

@Injectable()
export class CreatePersonalAccessToken {
  constructor(
    @Inject(PERSONAL_ACCESS_TOKEN_REPOSITORY)
    private readonly tokens: PersonalAccessTokenRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreatePersonalAccessTokenInput): Promise<CreatedPersonalAccessToken> {
    // Las dos reglas se comprueban antes de generar nada: un token rechazado no deja rastro.
    const scopes = toPersonalAccessTokenScopes(input.scopes);
    const expiresAt = personalAccessTokenExpiresAt(this.clock, input.expiresInDays);
    const { secret, hash } = createPersonalAccessTokenSecret();

    const created = await this.tokens.create({
      userId: input.userId,
      name: input.name,
      tokenHash: hash,
      scopes,
      expiresAt,
    });

    await this.audit.record({
      userId: input.userId,
      action: 'personal_access_token.created',
      entity: ENTITY,
      entityId: created.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return { ...created, token: formatPersonalAccessToken(created.id, secret) };
  }
}

@Injectable()
export class ListPersonalAccessTokens {
  constructor(
    @Inject(PERSONAL_ACCESS_TOKEN_REPOSITORY)
    private readonly tokens: PersonalAccessTokenRepository,
  ) {}

  /** Sin el valor de ningún token: no se guarda, así que tampoco se podría devolver. */
  async execute(userId: string): Promise<PersonalAccessTokenSummary[]> {
    return this.tokens.listActive(userId);
  }
}

export interface RevokePersonalAccessTokenInput extends RequestOrigin {
  userId: string;
  tokenId: string;
}

@Injectable()
export class RevokePersonalAccessToken {
  constructor(
    @Inject(PERSONAL_ACCESS_TOKEN_REPOSITORY)
    private readonly tokens: PersonalAccessTokenRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, tokenId, ip, userAgent }: RevokePersonalAccessTokenInput): Promise<void> {
    // Un token de otra cuenta responde igual que uno que no existe: el 404 no confirma nada.
    if (!(await this.tokens.revoke(userId, tokenId, this.clock.now()))) {
      throw new PersonalAccessTokenNotFoundError();
    }

    await this.audit.record({
      userId,
      action: 'personal_access_token.revoked',
      entity: ENTITY,
      entityId: tokenId,
      ip,
      userAgent,
    });
  }
}

export interface AuthenticatePersonalAccessTokenInput extends RequestOrigin {
  token: string;
  /** El scope que pide la ruta, o `null` si la ruta no acepta tokens personales. */
  requiredScope: PersonalAccessTokenScope | null;
}

/**
 * Comprueba un token personal y devuelve de quién es.
 *
 * Todo intento contra un token que existe queda en la bitácora: el uso válido y el rechazo, con
 * su motivo (decisión del autor). Uno con un id que no existe no deja rastro: no hay usuario al
 * que atribuirlo, y registrarlo dejaría llenar la tabla a cualquiera.
 */
@Injectable()
export class AuthenticatePersonalAccessToken {
  constructor(
    @Inject(PERSONAL_ACCESS_TOKEN_REPOSITORY)
    private readonly tokens: PersonalAccessTokenRepository,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({
    token,
    requiredScope,
    ip,
    userAgent,
  }: AuthenticatePersonalAccessTokenInput): Promise<string> {
    const parsed = parsePersonalAccessToken(token);
    if (parsed === null) throw new InvalidPersonalAccessTokenError();

    const stored = await this.tokens.findForAuthentication(parsed.id);
    if (stored === null) throw new InvalidPersonalAccessTokenError();

    const origin = { ip, userAgent };
    const rejection = this.rejectionOf(stored, parsed.secret);
    if (rejection !== null) {
      await this.record(stored, `personal_access_token.rejected_${rejection}`, origin);
      throw new InvalidPersonalAccessTokenError();
    }

    // Se sabe quién es, pero su token no alcanza: por ejemplo, el del celular queriendo tocar
    // la cuenta. Es un 403, y también queda registrado.
    if (requiredScope === null || !grantsScope(stored.scopes, requiredScope)) {
      await this.record(stored, 'personal_access_token.rejected_scope', origin);
      throw new InsufficientTokenScopeError();
    }

    await this.tokens.recordUse(stored.id, this.clock.now());
    await this.record(stored, 'personal_access_token.used', origin);

    return stored.userId;
  }

  /** El motivo del rechazo, o `null` si el token vale. El cliente nunca lo ve: solo la bitácora. */
  private rejectionOf(stored: StoredPersonalAccessToken, secret: string): string | null {
    // El secreto va primero: quien no lo tiene no debe poder averiguar si el token caducó.
    if (!secretMatches(secret, stored.tokenHash)) return 'secret';
    if (stored.revokedAt !== null) return 'revoked';
    if (hasExpired(stored.expiresAt, this.clock)) return 'expired';

    return null;
  }

  private async record(
    stored: StoredPersonalAccessToken,
    action: string,
    { ip, userAgent }: RequestOrigin,
  ): Promise<void> {
    await this.audit.record({
      userId: stored.userId,
      action,
      entity: ENTITY,
      entityId: stored.id,
      ip,
      userAgent,
    });
  }
}
