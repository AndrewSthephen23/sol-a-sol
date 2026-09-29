---
'@sol-a-sol/domain': patch
---

Reglas del presupuesto en el dominio. `computeBudgetVariance` compara lo planeado con lo real con la lectura de cada tipo: gasto y deuda son **límites** (diferencia = planeado − real, excedido apenas real > planeado) e ingreso, ahorro e inversión son **metas** (diferencia = real − planeado, cumplida al llegar). El % ejecutado se calcula sin redondear y no existe con lo planeado en cero. `summarizeBudget` junta partidas y real por tipo y moneda, sin convertir nunca, con la fila «Sin presupuesto» contada en el total. Y las reglas de una partida: cero o más, solo en una categoría madre y activa, una por categoría y moneda, en un mes válido.
