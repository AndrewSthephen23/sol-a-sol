---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

`GET /reports/monthly-summary?year=&month=`: el cierre de un mes, calculado con `computeMonthlySummary`. Un mes cerrado se compara con el anterior entero; el mes en curso, hasta hoy y contra el anterior hasta el mismo día. Un mes que no empezó responde 422 (`SUMMARY_MONTH_IN_FUTURE`).

- `reports` lee cada módulo por su API pública y un puerto propio: los totales por comercio de `transactions` (nuevo `totalsByMerchant`) y los nuevos `BudgetingLookup`, `CreditCardsLookup` y `GoalsLookup`.
- Si `budgeting`, `credit-cards` o `goals` están apagados, su sección no se consulta ni aparece, tampoco en OpenAPI.
- El cliente de la web, regenerado.
