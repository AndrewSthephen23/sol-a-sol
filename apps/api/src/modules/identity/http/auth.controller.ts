import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  type LoginRequest,
  loginRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { LoginUser } from '../application/login-user.js';
import { RegisterUser } from '../application/register-user.js';
import type { UserAccount } from '../ports/user-repository.js';
import { RegistrationAllowedGuard } from './registration-allowed.guard.js';

export interface AccessTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Segundos de vida del token, para que el cliente sepa cuándo renovarlo. */
  expiresIn: number;
}

@Controller('auth')
@RequiresFeature('identity')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly loginUser: LoginUser,
  ) {}

  /** La respuesta lleva solo datos públicos de la cuenta: nunca el hash ni el secreto TOTP. */
  @Post('register')
  @UseGuards(RegistrationAllowedGuard)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<UserAccount> {
    return this.registerUser.execute(body);
  }

  /** 200 y no 201: iniciar sesión no crea nada. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ): Promise<AccessTokenResponse> {
    const { token, expiresInSeconds } = await this.loginUser.execute(body);

    return { accessToken: token, tokenType: 'Bearer', expiresIn: expiresInSeconds };
  }
}
