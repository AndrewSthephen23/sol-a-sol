---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

`POST /captures`: la puerta del teléfono, todavía apagada (`FEATURE_CAPTURE=false`).

- Solo con token personal y el scope `captures:write`; una sesión recibe 403 (`PERSONAL_ACCESS_TOKEN_REQUIRED`, con el decorador nuevo `@RequiresPersonalAccessToken`).
- Siempre guarda un pedido bien formado, lo entienda o no: lee el monto, la fecha en Lima y el texto de la notificación, reconoce el método de pago, sugiere la categoría por reglas y marca los duplicados. Solo un pedido mal formado recibe 422, sin guardar nada.
- Idempotente: la misma `Idempotency-Key` devuelve la captura original (200). Sin ella, la clave sale de todo el pedido.
- Tapa los números de tarjeta antes de guardar y nunca registra el texto de la notificación.
- Tope propio de 30 capturas por minuto por IP (`CAPTURE_RATE_LIMIT_PER_MINUTE`).
- `TransactionsLookup.liveTransactionsOn` da las transacciones vigentes de un día, para los duplicados.
