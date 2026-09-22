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
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
  type TotpCodeRequest,
  totpCodeRequestSchema,
} from '@sol-a-sol/contracts';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { StrictRateLimit } from '../../../shared/throttling/rate-limits.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { ChangePassword } from '../application/change-password.js';
import { IssueSession, type Session } from '../application/issue-session.js';
import {
  ConfirmTotp,
  type ConfirmedTotp,
  DisableTotp,
  SetupTotp,
  type TotpSetup,
} from '../application/manage-totp.js';
import type { SecurityChangeNotice } from '../application/security-change.js';
import { RegenerateRecoveryCodes } from '../application/recovery-codes.js';
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
import { AccessTokenGuard, CurrentUser } from './access-token.guard.js';
import { RegistrationAllowedGuard } from './registration-allowed.guard.js';

export interface RecoveryCodesResponse {
  /** Diez códigos en claro. Es la única vez que se pueden leer. */
  recoveryCodes: string[];
}

export interface AccessTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Segundos de vida del token, para que el cliente sepa cuándo renovarlo. */
  expiresIn: number;
}

// Tope de peticiones estricto: cada intento aquí cuesta un hash argon2id de 19 MiB.
@StrictRateLimit()
@Controller('auth')
@RequiresFeature('identity')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly loginUser: LoginUser,
    private readonly issueSession: IssueSession,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUser: Logout,
    private readonly setupTotp: SetupTotp,
    private readonly confirmTotp: ConfirmTotp,
    private readonly disableTotp: DisableTotp,
    private readonly regenerateRecoveryCodes: RegenerateRecoveryCodes,
    private readonly changePassword: ChangePassword,
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
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<AccessTokenResponse> {
    const userId = await this.loginUser.execute({ ...body, ip, userAgent });

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

  /** El `otpauth://` y el secreto se devuelven **una sola vez**: después ya no se pueden leer. */
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async startTotp(@CurrentUser() userId: string): Promise<TotpSetup> {
    return this.setupTotp.execute(userId);
  }

  /**
   * Devuelve los códigos de recuperación, que se muestran **una sola vez**. Cierra las demás
   * sesiones y lista los tokens personales, que siguen valiendo.
   */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async verifyTotp(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpCodeRequestSchema)) body: TotpCodeRequest,
    @Headers('cookie') cookieHeader: string | undefined,
  ): Promise<ConfirmedTotp> {
    return this.confirmTotp.execute(userId, body.code, readRefreshCookie(cookieHeader));
  }

  /**
   * Cambia la contraseña. Cierra las **demás** sesiones, conserva esta y no revoca los tokens
   * personales: la respuesta los lista para ofrecer revocarlos.
   */
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async newPassword(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Headers('cookie') cookieHeader: string | undefined,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<SecurityChangeNotice> {
    return this.changePassword.execute({
      userId,
      ...body,
      currentRefreshToken: readRefreshCookie(cookieHeader),
      ip,
      userAgent,
    });
  }

  /** Rehace los códigos y **invalida los anteriores**. También se muestran una sola vez. */
  @Post('2fa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async newRecoveryCodes(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpCodeRequestSchema)) body: TotpCodeRequest,
  ): Promise<RecoveryCodesResponse> {
    return { recoveryCodes: await this.regenerateRecoveryCodes.execute(userId, body.code) };
  }

  /** Pide un código válido: quitar el segundo factor es una rebaja de seguridad. */
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  async removeTotp(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(totpCodeRequestSchema)) body: TotpCodeRequest,
  ): Promise<void> {
    await this.disableTotp.execute(userId, body.code);
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
