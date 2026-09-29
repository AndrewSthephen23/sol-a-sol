---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

`GET` y `PUT /api/v1/budgets/{year}/{month}`: leer y guardar el presupuesto de un mes, todavía con el módulo apagado. Un mes sin presupuesto responde sus partidas, ninguna, no un 404. Guardar reemplaza el mes entero, toda o nada: cada partida en una categoría madre y activa de la cuenta, una por categoría y moneda, con un monto de cero o más, en cualquier mes. Una partida que el mes ya tenía se puede volver a mandar aunque su categoría se haya archivado después.

`CatalogLookup` dice ahora si una categoría es de primer nivel. Y una partida cuelga también directo de su usuario: sin eso, borrar una cuenta con presupuesto fallaba.
