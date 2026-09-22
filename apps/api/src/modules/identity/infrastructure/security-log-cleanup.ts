import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { PurgeSecurityLogs } from '../application/purge-security-logs.js';

const A_DAY = 24 * 60 * 60 * 1000;

/**
 * Lanza la limpieza al arrancar y una vez al día.
 *
 * Un `setInterval` y no un planificador: es una sola tarea, y una dependencia más en la imagen
 * de producción no se paga por esto. El temporizador va con `unref` para que no impida al
 * proceso terminar, y se cancela al apagar.
 */
@Injectable()
export class SecurityLogCleanup implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SecurityLogCleanup.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly purge: PurgeSecurityLogs) {}

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), A_DAY);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const { auditEntries, loginAttempts } = await this.purge.execute();
      if (auditEntries + loginAttempts > 0) {
        this.logger.log(
          `Limpieza: ${String(auditEntries)} entradas de bitácora y ${String(loginAttempts)} intentos borrados.`,
        );
      }
    } catch (error) {
      // Que falle la limpieza no puede tumbar la API: se registra y se reintenta mañana.
      this.logger.error('No se pudo limpiar la bitácora', error);
    }
  }
}
