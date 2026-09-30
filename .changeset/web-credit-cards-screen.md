---
'@sol-a-sol/web': patch
---

Pantalla **Tarjetas** (`/credit-cards`, con el módulo `credit-cards` encendido): cada tarjeta con su ciclo, lo que debes y el consumo del ciclo por moneda, cuánto de la línea usas (barra y texto), el último estado de cuenta con su fecha límite de pago y si está pagado, y un enlace a sus movimientos. Las tarjetas sin configurar muestran «Configura tu tarjeta»; configurar y corregir piden línea, día de corte, fecha límite de pago y el saldo inicial opcional.

La lista de movimientos suma el filtro **Método de pago** (`?paymentMethodId=`), que incluye las transferencias.
