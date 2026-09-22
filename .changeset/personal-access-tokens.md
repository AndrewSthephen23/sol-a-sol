---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Ya se pueden crear **tokens personales**, para que el celular mande capturas sin la contraseña ni una sesión de navegador. `POST /api/v1/tokens` crea uno y lo muestra **una sola vez**: en la base queda solo el hash de su secreto. `GET /api/v1/tokens` los lista sin su valor, y `DELETE /api/v1/tokens/:id` lo revoca en el acto; el token de otra cuenta responde 404, igual que uno que no existe.

Un token **siempre caduca**, entre 1 y 365 días (90 si no se indica), y lleva **scopes mínimos**: hoy solo `captures:write`. Solo entra en las rutas marcadas con `@AcceptsPersonalAccessToken`; en cualquier otra recibe 403, así que el token del celular no puede listar tokens, crear otros ni tocar el segundo factor. Uno revocado o caducado responde 401.

El token (`sas_pat_…`) lleva dentro el id de su fila: se busca por clave primaria y el hash se compara en tiempo constante. La creación, la revocación, cada uso y cada rechazo quedan en la bitácora con su IP y user agent, y `lastUsedAt` dice si un token sigue en uso.
