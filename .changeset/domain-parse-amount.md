---
'@sol-a-sol/domain': patch
---

Lectura de montos escritos como texto: `parseAmount` convierte `"S/ 1,234.50"`, `"US$ 20"` o `"25.90"` en `Money` (formato peruano con punto decimal; `$` es dólares; la moneda por defecto la indica quien llama), y `findAmountInText` extrae el monto de una notificación bancaria completa, considerando solo los montos pegados a una moneda para no confundirlos con los dígitos de la tarjeta, fechas o cuotas. Si el texto trae montos distintos, no adivina: lanza un error para que la captura se revise a mano.
