import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/** AES-256-GCM: cifra y además detecta cualquier manipulación del texto cifrado. */
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SEPARATOR = '.';

/**
 * Cifra los secretos que la API necesita poder **leer de vuelta**, hoy solo el secreto TOTP.
 *
 * No es lo mismo que una contraseña: una contraseña se hashea y nunca se recupera, pero el
 * secreto TOTP hay que leerlo entero en cada login para calcular el código esperado.
 *
 * La clave es **propia** (`AUTH_TOTP_ENCRYPTION_KEY`) y no la de los JWT: usar la misma para
 * firmar y para cifrar mezcla propósitos, y además rotar la de los JWT dejaría ilegibles todos
 * los secretos TOTP, o sea a sus dueños fuera de su propia cuenta.
 */
@Injectable()
export class SecretBox {
  /** Formato: `iv.tag.cifrado`, los tres en base64url. */
  seal(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
    const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [iv, cipher.getAuthTag(), sealed]
      .map((part) => part.toString('base64url'))
      .join(SEPARATOR);
  }

  /** @throws {Error} si el texto cifrado se tocó, o si se guardó con otra clave. */
  open(sealed: string): string {
    const parts = sealed.split(SEPARATOR);
    if (parts.length !== 3) throw new Error('El secreto cifrado no tiene el formato esperado.');

    const [iv, tag, payload] = parts.map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv as Buffer);
    decipher.setAuthTag(tag as Buffer);

    return decipher.update(payload as Buffer).toString('utf8') + decipher.final('utf8');
  }
}

/**
 * Se lee en cada uso y no al construir la clase, para que el proceso no cifre con una clave y
 * descifre con otra si alguien cambia el entorno en caliente.
 */
function encryptionKey(): Buffer {
  const configured = process.env.AUTH_TOTP_ENCRYPTION_KEY;

  if (configured === undefined || configured === '') {
    throw new Error('AUTH_TOTP_ENCRYPTION_KEY is not set');
  }

  const key = Buffer.from(configured, 'base64');
  if (key.byteLength !== KEY_BYTES) {
    // El mensaje dice el tamaño esperado, nunca la clave ni el que tenía.
    throw new Error(`AUTH_TOTP_ENCRYPTION_KEY must be ${String(KEY_BYTES)} bytes in base64`);
  }

  return key;
}
