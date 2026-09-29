---
'@sol-a-sol/web': patch
---

El dashboard del mes en `/`, con `FEATURE_REPORTS` (apagado, y mientras tanto `/` sigue con la bienvenida). Por moneda y sin convertir, muestra:

- los KPIs, con el saldo negativo en rojo y con signo;
- las barras de gasto diario, con un resumen en texto;
- la dona de gasto por categoría, cuya leyenda enlaza a los movimientos de cada categoría;
- las tablas por tipo.

El mes va en la URL. Los gráficos usan Recharts y se dibujan solo en el navegador, así la CSP sigue sin `'unsafe-inline'`.
