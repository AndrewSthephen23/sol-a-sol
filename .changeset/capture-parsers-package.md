---
'@sol-a-sol/capture-parsers': patch
---

Nace el paquete `@sol-a-sol/capture-parsers`, que entiende el texto de una notificación bancaria. Todavía sin bancos: trae el contrato de los parsers, el selector y la prueba que recorre los fixtures.

- `parseNotification` usa el parser de la fuente que reconoce el texto o, si ninguna, lo lee como gasto con el monto que encuentre y el aviso `UNKNOWN_SOURCE`.
- Nunca lanza: lo que no entiende queda nulo con su aviso, y un parser que falla cae a la lectura genérica.
- Antes de leer, tapa toda tira de 13 o más dígitos y deja solo sus últimos 4: un número de tarjeta nunca llega a guardarse.
- Agregar un banco es agregar sus fixtures y su parser. Mutation testing al 100 %.
