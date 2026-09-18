import { HttpStatus } from '@nestjs/common';

/**
 * Código estable para los errores que no vienen del dominio, derivado del estado HTTP.
 * Así la web puede distinguir dos errores con el mismo código de estado sin leer el texto.
 */
const CODE_BY_STATUS = new Map<number, string>([
  [HttpStatus.BAD_REQUEST, 'BAD_REQUEST'],
  [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
  [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
  [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
  [HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED'],
  [HttpStatus.CONFLICT, 'CONFLICT'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE'],
  [HttpStatus.UNPROCESSABLE_ENTITY, 'UNPROCESSABLE_ENTITY'],
  [HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS'],
  [HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_SERVER_ERROR'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE'],
]);

/** Título corto y fijo del tipo de error, no del caso concreto (RFC 9457). */
const TITLE_BY_STATUS = new Map<number, string>([
  [HttpStatus.BAD_REQUEST, 'Bad request'],
  [HttpStatus.UNAUTHORIZED, 'Unauthorized'],
  [HttpStatus.FORBIDDEN, 'Forbidden'],
  [HttpStatus.NOT_FOUND, 'Not found'],
  [HttpStatus.METHOD_NOT_ALLOWED, 'Method not allowed'],
  [HttpStatus.CONFLICT, 'Conflict'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'Payload too large'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'Unsupported media type'],
  [HttpStatus.UNPROCESSABLE_ENTITY, 'Unprocessable content'],
  [HttpStatus.TOO_MANY_REQUESTS, 'Too many requests'],
  [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'Service unavailable'],
]);

export function codeForStatus(status: number): string {
  return CODE_BY_STATUS.get(status) ?? `HTTP_${String(status)}`;
}

export function titleForStatus(status: number): string {
  return TITLE_BY_STATUS.get(status) ?? `HTTP ${String(status)}`;
}
