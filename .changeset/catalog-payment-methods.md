---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/contracts': patch
---

Métodos de pago en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/payment-methods` para cuentas, billeteras, tarjetas de crédito y efectivo. No hay `DELETE`: un método se archiva.

- **De una tarjeta solo se guardan alias, banco y últimos 4 dígitos.** Un número más largo se rechaza, no se recorta, y un campo como `cvv` o `cardNumber` también se rechaza.
- **Reglas por tipo:** una tarjeta de crédito lleva sus últimos 4 dígitos, una cuenta o billetera lleva moneda (una tarjeta bimoneda no), y el efectivo no tiene banco. Las aplica el dominio y las repite la base con restricciones `CHECK`.
- **El alias es único** por usuario, sin distinguir mayúsculas y contando los archivados.
- Todo cambia menos el tipo, y solo desde una sesión: un token personal recibe 403.

SonarQube Cloud recibe ahora también la cobertura de las pruebas de integración, que son las que ejercitan controllers y repositorios.
