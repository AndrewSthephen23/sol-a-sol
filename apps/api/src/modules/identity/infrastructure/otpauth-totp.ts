import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  totpCountersToAccept,
} from '@sol-a-sol/domain';
import { Secret, TOTP as OtpAuthGenerator } from 'otpauth';

import { CLOCK } from '../../../shared/time/system-clock.js';
import type { Totp, TotpEnrolment, TotpVerification } from '../ports/totp.js';

/** Lo que muestra la aplicación de autenticación junto al código. */
const ISSUER = 'Sol a Sol';

/** 160 bits, el tamaño que recomienda la RFC 4226 para el secreto compartido. */
const SECRET_BYTES = 20;

@Injectable()
export class OtpAuthTotp implements Totp {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  enrol(accountName: string): TotpEnrolment {
    const secret = new Secret({ size: SECRET_BYTES });

    return { secret: secret.base32, uri: this.totpFor(secret.base32, accountName).toString() };
  }

  verify(secret: string, code: string): TotpVerification | null {
    const totp = this.totpFor(secret);

    // La ventana la decide el dominio, no la librería: así la regla se prueba con reloj fijo y
    // no depende de cómo cuente `otpauth` sus periodos.
    for (const counter of totpCountersToAccept(this.clock)) {
      if (totp.generate({ timestamp: counter * TOTP_PERIOD_SECONDS * 1000 }) === code) {
        return { counter };
      }
    }

    return null;
  }

  private totpFor(secret: string, label?: string): OtpAuthGenerator {
    return new OtpAuthGenerator({
      issuer: ISSUER,
      label,
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: Secret.fromBase32(secret),
    });
  }
}
