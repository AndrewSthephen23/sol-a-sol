---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Andamiaje del módulo `identity`, el primero de negocio, con sus cinco capas, su manifest en la web y su flag `FEATURE_IDENTITY` apagado. Se agregan dos tablas: `personal_access_tokens`, para que un dispositivo use la API sin la contraseña (se guarda solo el hash, con scopes, expiración y revocación, y se borran con la cuenta), y `audit_logs`, la bitácora de seguridad. La bitácora va **sin clave foránea** a propósito: una entrada de auditoría es un hecho inmutable y debe sobrevivir al borrado de quien lo provocó, así que borrar una cuenta no borra la evidencia de lo que hizo. Todavía no hay lógica: la ficha del módulo recoge las reglas decididas para el hito.
