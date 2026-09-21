---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

El segundo factor ya tiene red de seguridad. Al activarlo se entregan **diez códigos de recuperación**, mostrados una sola vez; después solo queda su hash. Cada uno sirve una vez y en el inicio de sesión se usan **en lugar** del código del teléfono, así que perderlo deja de significar perder la cuenta.

Están pensados para copiarse a mano de un papel: alfabeto base32 de Crockford —sin `I`, `L`, `O` ni `U`, que se confunden con `1`, `0` y otras— en grupos de cuatro, y se aceptan tecleados sin guiones, con espacios o en minúsculas. Doce símbolos son unos 60 bits, que no se adivinan probando.

`POST /api/v1/auth/2fa/recovery-codes` los rehace e invalida los anteriores, y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra.
