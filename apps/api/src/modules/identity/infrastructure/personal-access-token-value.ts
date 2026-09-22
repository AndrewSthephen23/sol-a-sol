import { timingSafeEqual } from 'node:crypto';

import { createSessionToken, hashSessionToken } from './session-token.js';

/**
 * Prefijo de todo token personal.
 *
 * Sirve para dos cosas: el guard distingue un token personal de un JWT sin intentar verificarlo,
 * y un escáner de secretos (gitleaks, el de GitHub) puede reconocerlo si alguien lo pega donde
 * no debe. Es la misma idea que el `ghp_` de GitHub.
 */
export const PERSONAL_ACCESS_TOKEN_PREFIX = 'sas_pat_';

const ID_LENGTH = 32;
/** 32 bytes en base64url, sin relleno. */
const SECRET_LENGTH = 43;
const UUID_GROUPS = [8, 4, 4, 4, 12];
const HEX = /^[0-9a-f]+$/;
const BASE64URL = /^[\w-]+$/;

export interface PersonalAccessTokenSecret {
  /** Lo que se entrega al dueño, dentro del token. Solo existe en la respuesta que lo crea. */
  secret: string;
  /** Lo único que se guarda. */
  hash: string;
}

export interface ParsedPersonalAccessToken {
  id: string;
  secret: string;
}

/** 256 bits aleatorios de `randomBytes`, igual que un refresco: no se adivinan. */
export function createPersonalAccessTokenSecret(): PersonalAccessTokenSecret {
  const { value, hash } = createSessionToken();

  return { secret: value, hash };
}

/**
 * `sas_pat_` + el `id` de la fila (sin guiones) + el secreto.
 *
 * Llevar el `id` dentro permite buscar la fila por clave primaria y comparar el hash **en tiempo
 * constante**. Buscar directamente por el hash también funcionaría, pero la comparación la haría
 * el índice de la base, y su tiempo sí depende de cuántos caracteres coinciden. El `id` no es
 * secreto: aparece en la lista de tokens de su dueño.
 */
export function formatPersonalAccessToken(id: string, secret: string): string {
  return `${PERSONAL_ACCESS_TOKEN_PREFIX}${id.replaceAll('-', '')}${secret}`;
}

export function looksLikePersonalAccessToken(value: string): boolean {
  return value.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX);
}

/** `null` si no tiene la forma de un token personal: no hace falta ni consultar la base. */
export function parsePersonalAccessToken(value: string): ParsedPersonalAccessToken | null {
  if (!looksLikePersonalAccessToken(value)) return null;

  const body = value.slice(PERSONAL_ACCESS_TOKEN_PREFIX.length);
  if (body.length !== ID_LENGTH + SECRET_LENGTH) return null;

  const compactId = body.slice(0, ID_LENGTH);
  const secret = body.slice(ID_LENGTH);
  if (!HEX.test(compactId) || !BASE64URL.test(secret)) return null;

  return { id: withDashes(compactId), secret };
}

/** Compara en tiempo constante: el tiempo de respuesta no dice cuántos caracteres acertó nadie. */
export function secretMatches(secret: string, storedHash: string): boolean {
  const presented = Buffer.from(hashSessionToken(secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  // `timingSafeEqual` exige la misma longitud. Los dos son SHA-256, así que solo difieren si la
  // fila está corrupta, y eso no es un secreto que haya que proteger.
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

function withDashes(compactId: string): string {
  const groups: string[] = [];
  let start = 0;

  for (const size of UUID_GROUPS) {
    groups.push(compactId.slice(start, start + size));
    start += size;
  }

  return groups.join('-');
}
