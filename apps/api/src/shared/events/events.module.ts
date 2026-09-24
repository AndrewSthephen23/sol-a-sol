import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { EventEmitterPublisher } from './event-emitter-publisher.js';
import { EVENT_PUBLISHER } from './event-publisher.js';

/** Global: cualquier módulo publica o escucha eventos de dominio (ADR-0004). */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [{ provide: EVENT_PUBLISHER, useClass: EventEmitterPublisher }],
  exports: [EVENT_PUBLISHER],
})
export class EventsModule {}
