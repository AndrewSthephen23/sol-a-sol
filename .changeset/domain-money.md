---
'@sol-a-sol/domain': patch
---

Nuevo value object `Money` para montos exactos en soles y dólares (con `decimal.js`, nunca `number`): suma, resta y multiplicación sin errores de coma flotante; redondeo bancario a 2 decimales solo al presentar o persistir; porcentajes con 2 decimales y sin dividir por cero; y reparto en cuotas sin perder céntimos, asignando los sobrantes a las primeras. Rechaza montos con más de 2 decimales y operaciones entre monedas distintas.
