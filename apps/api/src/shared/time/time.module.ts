import { Global, Module } from '@nestjs/common';

import { CLOCK, SystemClock } from './system-clock.js';

/** Global: cualquier módulo que calcule vencimientos o ciclos necesitará el reloj. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class TimeModule {}
