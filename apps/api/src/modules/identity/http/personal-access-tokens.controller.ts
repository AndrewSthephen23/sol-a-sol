import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreatePersonalAccessTokenRequest,
  createPersonalAccessTokenRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import {
  CreatePersonalAccessToken,
  type CreatedPersonalAccessToken,
  ListPersonalAccessTokens,
  RevokePersonalAccessToken,
} from '../application/personal-access-tokens.js';
import { PersonalAccessTokenNotFoundError } from '../domain/errors.js';
import type { PersonalAccessTokenSummary } from '../ports/personal-access-token-repository.js';
import { AccessTokenGuard, CurrentUser } from './access-token.guard.js';

const tokenIdSchema = z.uuid();

/**
 * Tokens personales, uno por dispositivo.
 *
 * Solo se gestionan **desde una sesión**: ninguna ruta lleva `@AcceptsPersonalAccessToken`, así
 * que un token personal no puede crear otros tokens ni revocarlos (recibe 403).
 */
@Controller('tokens')
@RequiresFeature('identity')
@UseGuards(AccessTokenGuard)
export class PersonalAccessTokensController {
  constructor(
    private readonly createToken: CreatePersonalAccessToken,
    private readonly listTokens: ListPersonalAccessTokens,
    private readonly revokeToken: RevokePersonalAccessToken,
  ) {}

  /** Sin el valor de ningún token: solo se muestra al crearlo. */
  @Get()
  async list(@CurrentUser() userId: string): Promise<PersonalAccessTokenSummary[]> {
    return this.listTokens.execute(userId);
  }

  /** La respuesta trae el token en claro **una sola vez**: después no se puede recuperar. */
  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createPersonalAccessTokenRequestSchema))
    body: CreatePersonalAccessTokenRequest,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<CreatedPersonalAccessToken> {
    return this.createToken.execute({ userId, ...body, ip, userAgent });
  }

  /** 404 si no existe, ya se revocó **o es de otra cuenta**: desde fuera no se distinguen. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() userId: string,
    @Param('id') tokenId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<void> {
    // Un id que ni siquiera es un UUID tampoco existe: 404 y no 422, y además la base no
    // llega a ver un valor que su tipo `uuid` rechazaría con un error interno.
    if (!tokenIdSchema.safeParse(tokenId).success) throw new PersonalAccessTokenNotFoundError();

    await this.revokeToken.execute({ userId, tokenId, ip, userAgent });
  }
}
