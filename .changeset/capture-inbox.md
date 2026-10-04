---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

La bandeja de capturas en la API, todavía apagada (`FEATURE_CAPTURE=false`), solo desde una sesión:

- `GET /captures` (por revisar, con las duplicadas marcadas, o las descartadas; primero la más reciente, con cursor) y `GET /captures/{id}`, con el pedido crudo mientras no se confirme.
- `PATCH /captures/{id}`: se corrige todo; cambiar el tipo sin categoría la limpia, y una categoría o un método nuevos tienen que ser de la cuenta, estar activos y, la categoría, del tipo de la captura.
- `POST /captures/{id}/discard` y `/restore`: «Deshacer» la devuelve como estaba, por revisar o duplicada (columna nueva `discarded_from`).
- Una tarea diaria (`@nestjs/schedule`) borra del todo las descartadas hace más de 90 días.
- En el dominio: `correctCapture`, `discardCapture`, `restoreCapture` y `discardedPurgeCutoff`.
