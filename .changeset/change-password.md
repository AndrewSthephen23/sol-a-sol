---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Ya se puede **cambiar la contraseña** con `POST /api/v1/auth/password`, que pide la actual y aplica a la nueva la misma política que el registro. Una contraseña actual equivocada responde 403, no 401, para que la web no cierre una sesión que sí vale.

Al cambiarla, y también **al activar el segundo factor**, se cierran las sesiones de los demás navegadores y se conserva la desde la que se hizo el cambio. Los tokens personales **no se revocan**, para no romper en silencio la captura desde el celular: la respuesta trae cuántas sesiones se cerraron y la lista de tokens que siguen valiendo, para ofrecer revocarlos. El cambio queda en la bitácora como `password.changed`.
