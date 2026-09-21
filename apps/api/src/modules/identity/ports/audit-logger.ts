/** Un hecho de seguridad que quedó registrado. Ver `audit_logs` en la ficha del módulo. */
export interface AuditEntry {
  /** Ausente cuando no se sabe quién lo provocó (un login contra un correo inexistente). */
  userId?: string;
  /** Qué pasó, en inglés y en pasado: `refresh_token.reused`. */
  action: string;
  /** Sobre qué tipo de entidad: `user`, `refresh_token`. */
  entity: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditLogger {
  record(entry: AuditEntry): Promise<void>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const AUDIT_LOGGER = Symbol('AuditLogger');
