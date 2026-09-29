---
'@sol-a-sol/web': patch
'@sol-a-sol/domain': patch
---

La pantalla del presupuesto (`/budgeting`), todavía con el módulo apagado: el mes en la URL con el mismo selector que las transacciones, lo planeado contra lo real por tipo y moneda con su barra de % ejecutado y una frase que dice qué significa («Quedan…», «Te pasaste…», «Faltan…», «Cumplida»), «Sin presupuesto» y el total del tipo. Se arma y se corrige el mes entero de una vez, y se copia del mes anterior diciendo de dónde y qué quedó fuera. El dominio suma `formatPercentage`: un porcentaje con 2 decimales y redondeo bancario.
