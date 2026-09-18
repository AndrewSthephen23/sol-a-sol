---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Toda la API responde ya sus errores en Problem Details (RFC 9457), con `Content-Type: application/problem+json`. El `type` es un URN estable (`urn:sol-a-sol:error:invalid-amount`) y el `code` viaja en el cuerpo para que la web arme el mensaje en español; `title` y `detail` quedan en inglés, para quien depura. Un error de validación responde 422 con un elemento de `errors[]` por campo (`field`, `code`, `message`), un error de dominio responde con su código estable, y cualquier fallo inesperado responde un 500 genérico que no filtra nada del sistema, con el detalle real solo en el log.

Nace también `@sol-a-sol/contracts`, con los esquemas Zod que comparten la API y la web, empezando por registro e inicio de sesión. Describen la forma del mensaje, no las reglas de negocio: la política de contraseñas se queda en `@sol-a-sol/domain`, para que no acabe definida en dos sitios que un día dejen de coincidir.
