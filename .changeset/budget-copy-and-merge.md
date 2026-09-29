---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

`POST /api/v1/budgets/{year}/{month}/copy-from-previous`: copia al mes las partidas que le faltan, del mes anterior o del último con presupuesto, sin pisar ninguna. Las categorías archivadas no se copian y la respuesta dice cuáles quedaron fuera; sin ningún mes anterior con presupuesto responde sin copiar nada, no con un error.

El presupuesto sigue las fusiones de categorías: escucha `catalog.category.merged` y pasa las partidas a la destino en todos los meses, sumándolas si la destino ya tenía una ese mes en esa moneda.
