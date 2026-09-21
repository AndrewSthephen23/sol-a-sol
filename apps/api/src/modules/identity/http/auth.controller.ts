import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type LoginRequest,
  loginRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { IssueSession, type Session } from '../application/issue-session.js';
import { LoginUser } from '../application/login-user.js';
import { Logout } from '../application/logout.js';
import { RefreshSession } from '../application/refresh-session.js';
import { RegisterUser } from '../application/register-user.js';
import type { UserAccount } from '../ports/user-repository.js';
import {
  clearRefreshCookie,
  type CookieResponse,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
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
    private readonly issueSession: IssueSession,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUser: Logout,
  ) {}

  /** La respuesta lleva solo datos públicos de la cuenta: nunca el hash ni el secreto TOTP. */
  @Post('register')
  @UseGuards(RegistrationAllowedGuard)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<UserAccount> {
    return this.registerUser.execute(body);
  }

  /** 200 y no 201: iniciar sesión no crea nada que el cliente pueda direccionar. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AccessTokenResponse> {
    const userId = await this.loginUser.execute(body);

    return this.startSession(await this.issueSession.execute(userId), response);
  }

  /** El refresco viaja solo en la cookie: el cuerpo de la petición no pinta nada aquí. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AccessTokenResponse> {
    const session = await this.refreshSession.execute({
      token: readRefreshCookie(cookieHeader),
      ip,
      userAgent,
    });

    return this.startSession(session, response);
  }

  /** 204 siempre, valga la cookie o no: quien cierra sesión quiere irse, no un diagnóstico. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<void> {
    await this.logoutUser.execute(readRefreshCookie(cookieHeader));
    clearRefreshCookie(response);
  }

  private startSession(session: Session, response: CookieResponse): AccessTokenResponse {
    setRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);

    return {
      accessToken: session.access.token,
      tokenType: 'Bearer',
      expiresIn: session.access.expiresInSeconds,
    };
  }
}
