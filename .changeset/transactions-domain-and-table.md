---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

Nace el módulo `transactions` (apagado con `FEATURE_TRANSACTIONS=false`) con sus reglas de dominio y su tabla. Todavía no tiene endpoints.

- **El monto siempre es positivo**: el signo lo da el tipo. Para el saldo del mes solo el ingreso suma.
- **Gasto** es fijo más variable (la deuda va aparte), y **ahorro** es ahorro más inversión, para la tasa de ahorro.
- **La fecha llega hasta hoy** en la hora de Lima, sin fechas futuras.
- **La moneda** es la del método de pago si no se indica otra. Si no hay ninguna, se exige: nunca se supone soles ni se convierte.
- **La categoría** es del mismo tipo que la transacción y no puede estar archivada.

La tabla guarda la fecha como `DATE` y el monto como `NUMERIC(18,2)` positivo. Además, la base garantiza que la categoría y el método de pago sean del mismo usuario, y la categoría del mismo tipo.
