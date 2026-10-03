---
'@sol-a-sol/domain': patch
---

Progreso de una meta de ahorro: `computeGoalProgress` (ahorrado, falta, excedente, porcentaje, avance esperado, aporte mensual sugerido y estado), con sus reglas (`assertGoalSettings`, `assertGoalContribution`, `assertWithdrawalCovered`) y el estado de un aporte enlazado a una transacción (`linkedContributionState`, `assertLinkableTransaction`, `linkedContribution`). Además, `countPercentage` para el porcentaje entre dos cantidades enteras.

- Estados `ON_TRACK`, `AT_RISK`, `ACHIEVED` y `OVERDUE`. **En riesgo** con el avance más de 10 puntos por debajo del esperado aportando parejo, medido al cierre del mes anterior.
- **Aporte sugerido**: lo que falta entre los meses que quedan, contando el mes en curso (o desde el de inicio), redondeado hacia arriba al céntimo. Sin sugerido con la fecha fin pasada.
- Pasarse del objetivo muestra el porcentaje real y el excedente. Un aporte futuro todavía no cuenta; uno anterior al inicio, sí. Un retiro no puede dejar la meta en negativo.
