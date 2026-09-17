# Glosario (negocio ES ↔ código EN)

La interfaz y la documentación van en español; el código, en inglés. Esta tabla es la **fuente de verdad** para esa traducción: si un término no está aquí, agrégalo antes de usarlo.

| Español                                         | Código                                              |
| ----------------------------------------------- | --------------------------------------------------- |
| Monto / Dinero                                  | `Money`                                             |
| Moneda (soles / dólares)                        | `Currency` (`PEN` / `USD`)                          |
| Repartir en cuotas                              | `allocate`                                          |
| Porcentaje de un total                          | `percentageOf`                                      |
| Transacción                                     | `Transaction`                                       |
| Ingreso / Gasto fijo / Gasto variable           | `INCOME` / `FIXED_EXPENSE` / `VARIABLE_EXPENSE`     |
| Ahorro / Inversión / Deuda                      | `SAVING` / `INVESTMENT` / `DEBT`                    |
| Categoría / Subcategoría                        | `Category` (con `parentId`)                         |
| Método de pago                                  | `PaymentMethod`                                     |
| Tarjeta de crédito                              | `CreditCard`                                        |
| Línea de crédito                                | `creditLimit`                                       |
| Día de corte                                    | `statementDay`                                      |
| Fecha límite de pago                            | `paymentDueDate`                                    |
| Ciclo de facturación                            | `BillingCycle`                                      |
| Utilización                                     | `utilization`                                       |
| Cuotas                                          | `Installment`                                       |
| Presupuesto / Partida                           | `Budget` / `BudgetLine`                             |
| Presupuestado / Real / Diferencia               | `planned` / `actual` / `variance`                   |
| Meta de ahorro / Aporte                         | `SavingsGoal` / `GoalContribution`                  |
| Resumen mensual / Resumen anual                 | `MonthlySummary` / `AnnualSummary`                  |
| Tasa de ahorro                                  | `savingsRate`                                       |
| Captura / Bandeja                               | `Capture` / `inbox`                                 |
| Regla de categorización                         | `CategorizationRule`                                |
| Token personal                                  | `PersonalAccessToken`                               |
| Pendiente / Confirmada / Descartada / Duplicada | `PENDING` / `CONFIRMED` / `DISCARDED` / `DUPLICATE` |
| Nivel de utilización OK / Alta / Crítica        | `OK` / `HIGH` / `CRITICAL`                          |

**Todos los enums del código van en inglés.** Las etiquetas que ve el usuario se traducen en la capa de presentación, nunca en el dominio.
