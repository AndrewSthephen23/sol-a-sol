import type { EventPublisher } from './event-publisher.js';

/** Publicador en memoria para probar casos de uso: guarda lo publicado, en orden. */
export class RecordingEventPublisher implements EventPublisher {
  readonly published: { name: string; payload: object }[] = [];

  publish(name: string, payload: object): Promise<void> {
    this.published.push({ name, payload });

    return Promise.resolve();
  }
}
