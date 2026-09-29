import { Module } from '@nestjs/common';

/**
 * Módulo credit-cards. Entra a main detrás de FEATURE_CREDIT_CARDS: sus rutas llevan
 * `@RequiresFeature('credit-cards')` y responden 404 mientras el flag esté apagado.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class CreditCardsModule {}
