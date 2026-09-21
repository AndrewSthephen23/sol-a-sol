import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  formatRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
} from '@sol-a-sol/domain';

import { hashSessionToken } from './session-token.js';

export interface GeneratedRecoveryCode {
  /** Lo que se muestra al dueño, en grupos de cuatro. Solo existe en esa respuesta. */
  formatted: string;
  /** Lo único que se guarda. */
  hash: string;
}

@Injectable()
export class RecoveryCodeGenerator {
  generate(): GeneratedRecoveryCode[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const code = randomCode();

      return { formatted: formatRecoveryCode(code), hash: hashSessionToken(code) };
    });
  }
}

function randomCode(): string {
  const symbols: string[] = [];

  for (let position = 0; position < RECOVERY_CODE_LENGTH; position++) {
    // `randomInt` reparte de forma uniforme: `randomBytes() % 32` favorecería los primeros
    // símbolos si el alfabeto no dividiera exacto.
    symbols.push(RECOVERY_CODE_ALPHABET.charAt(randomInt(RECOVERY_CODE_ALPHABET.length)));
  }

  return symbols.join('');
}
