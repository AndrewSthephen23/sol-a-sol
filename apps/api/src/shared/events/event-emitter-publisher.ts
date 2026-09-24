import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { EventPublisher } from './event-publisher.js';

/**
 * Adaptador sobre `@nestjs/event-emitter`, un bus en memoria dentro del mismo proceso. Si algún
 * día hace falta una cola (reintentos, otro proceso), se cambia este adaptador y nada más.
 *
 * `emitAsync` espera a los oyentes. Sus errores no llegan aquí: `@OnEvent` los atrapa y los
 * registra (`suppressErrors`, activo por defecto), que es justo lo que promete el puerto.
 */
@Injectable()
export class EventEmitterPublisher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(name: string, payload: object): Promise<void> {
    await this.emitter.emitAsync(name, payload);
  }
}
