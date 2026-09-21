import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { type RegisterRequest, registerRequestSchema } from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { RegisterUser } from '../application/register-user.js';
import type { UserAccount } from '../ports/user-repository.js';
import { RegistrationAllowedGuard } from './registration-allowed.guard.js';

@Controller('auth')
@RequiresFeature('identity')
export class AuthController {
  constructor(private readonly registerUser: RegisterUser) {}

  /** La respuesta lleva solo datos públicos de la cuenta: nunca el hash ni el secreto TOTP. */
  @Post('register')
  @UseGuards(RegistrationAllowedGuard)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<UserAccount> {
    return this.registerUser.execute(body);
  }
}
