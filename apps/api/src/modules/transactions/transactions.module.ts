import { Module } from '@nestjs/common';

/**
 * Módulo transactions. Entra a main detrás de FEATURE_TRANSACTIONS: sus rutas llevan
 * `@RequiresFeature('transactions')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class TransactionsModule {}
