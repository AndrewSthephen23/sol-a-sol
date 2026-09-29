---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Empieza el hito **H5**: nace el módulo `credit-cards` (apagado con `FEATURE_CREDIT_CARDS=false`) con su tabla, `credit_cards`. Todavía no tiene endpoints.

- Una configuración por **método de pago** `CREDIT_CARD`: línea en una moneda (`NUMERIC(18,2)`, cero o más), día de corte (1 a 31) y regla de pago (N días después del corte, o un día fijo del mes).
- Saldo inicial **opcional**, uno por moneda, con su fecha.
- La base exige que la tarjeta sea de la misma cuenta que su método de pago y que el método sea una tarjeta de crédito.

Las reglas de las tarjetas, decididas con el autor, quedan escritas en `docs/modules/credit-cards.md`.
