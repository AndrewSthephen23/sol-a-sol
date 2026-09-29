---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

El presupuesto de un mes trae lo real al lado de lo planeado, todavía con el módulo apagado: por tipo y moneda, cada partida con su diferencia, su % ejecutado (sin redondear, `null` con lo planeado en cero) y su estado, la fila «Sin presupuesto» y el total del tipo. Lo real de una subcategoría suma en su madre, solo cuenta el mes pedido, sin transferencias ni borradas, y nunca se convierte moneda.

`transactions` ofrece por primera vez una lectura a otros módulos por su API pública, `TransactionsLookup`: totales por categoría, tipo y moneda entre dos fechas. La usará también el dashboard.
