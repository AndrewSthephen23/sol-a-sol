---
'@sol-a-sol/domain': patch
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Pantalla de metas (`/goals`), detrás de `FEATURE_GOALS` (todavía apagado): crear y corregir una meta, aportar a mano o enlazando una transacción de ahorro, retirar, quitar un aporte con «Deshacer» y archivar.

- Cada meta dice en texto cuánto va, cuánto falta, cómo va y cuánto aportar al mes; la barra de avance solo lo acompaña.
- El progreso trae `behind`: cuánto falta para ir al día, calculado en el dominio (`computeGoalProgress`), para el «En riesgo: te faltan S/ … para ir al día».
- El menú pasa a dos líneas cuando sus secciones no caben en el teléfono, en vez de desbordar la página.
