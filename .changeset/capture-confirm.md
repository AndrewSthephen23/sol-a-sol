---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

Confirmar capturas de la bandeja, todavía apagado (`FEATURE_CAPTURE=false`):

- `POST /captures/{id}/confirm` crea su transacción, con su captura y su origen, y borra el texto crudo. Una sola transacción por captura: confirmar dos veces, aunque sea a la vez, responde 409 sin crear otra.
- `POST /captures/confirm` confirma varias, cada una por su lado, y dice por qué no se pudieron las demás.
- «Recordar para este comercio» crea o actualiza la regla de su comercio; sin comercio, 422.
- `transactions` gana su escritura pública, `TransactionsRecorder`, que pasa por las mismas reglas que cualquier transacción.
