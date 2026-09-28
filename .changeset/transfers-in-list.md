---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

El listado `GET /api/v1/transactions` trae también las transferencias, mezcladas por fecha y marcadas con `kind` (`transaction` o `transfer`), con el filtro nuevo `?kind=`. Filtrar por tipo o categoría las deja fuera; por cuenta o moneda trae las que salen o llegan. Los totales siguen siendo solo de las transacciones.
