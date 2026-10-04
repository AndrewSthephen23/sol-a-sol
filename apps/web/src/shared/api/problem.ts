const PROBLEM_TYPE_PREFIX = 'urn:sol-a-sol:error:';

/**
 * El código estable de un error de la API, sacado de su `type`
 * (`urn:sol-a-sol:error:totp-required` → `TOTP_REQUIRED`). `null` si no es un Problem Details
 * de la API: una respuesta de otro servidor, o un cuerpo que no es JSON.
 */
export function problemCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('type' in body)) return null;
  const { type } = body;
  if (typeof type !== 'string' || !type.startsWith(PROBLEM_TYPE_PREFIX)) return null;

  return type.slice(PROBLEM_TYPE_PREFIX.length).toUpperCase().replaceAll('-', '_');
}

/**
 * Textos en español para los códigos que la interfaz muestra. La API manda `title` y `detail` en
 * inglés, para quien depura: **nunca** se muestran, ni siquiera cuando falta una traducción.
 */
const MESSAGES: Readonly<Record<string, string>> = {
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  INVALID_TOTP_CODE: 'El código no es válido, ya caducó o ya se usó.',
  VALIDATION_FAILED: 'Revisa los datos e inténtalo de nuevo.',
  // La bandeja de capturas (H7).
  CAPTURE_NOT_PENDING: 'Ya se confirmó o se descartó, quizá desde otra pestaña.',
  CAPTURE_NOT_DISCARDED: 'Ya no está descartada.',
  CAPTURE_NOT_FOUND: 'Esta captura ya no existe.',
  CAPTURE_AMOUNT_MISSING: 'Falta el monto.',
  CAPTURE_CURRENCY_MISSING: 'Falta la moneda.',
  CAPTURE_CATEGORY_MISSING: 'Falta la categoría.',
  CAPTURE_DESCRIPTION_MISSING: 'Falta la descripción.',
  CAPTURE_MERCHANT_MISSING: 'Sin comercio no hay nada que recordar.',
};

export const GENERIC_ERROR = 'Algo salió mal. Inténtalo de nuevo en un momento.';
export const NETWORK_ERROR = 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.';

/** El mensaje para un error de la API, o uno genérico si el código no tiene traducción. */
export function errorMessage(code: string | null): string {
  return (code === null ? undefined : MESSAGES[code]) ?? GENERIC_ERROR;
}

/**
 * Un 429 dice cuánto esperar en `Retry-After` (segundos). La interfaz lo muestra y **no reintenta
 * sola**: los bloqueos los decide la API, y la web no lleva una segunda cuenta de intentos.
 */
export function tooManyAttemptsMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  if (retryAfter === null || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.';
  }
  if (seconds < 60) {
    const unit = seconds === 1 ? 'segundo' : 'segundos';

    return `Demasiados intentos. Vuelve a intentarlo en ${String(Math.ceil(seconds))} ${unit}.`;
  }
  const minutes = Math.ceil(seconds / 60);

  return `Demasiados intentos. Vuelve a intentarlo en ${String(minutes)} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}
