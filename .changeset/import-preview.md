---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Vista previa de la importación (`POST /api/v1/transactions/import/preview`): sin guardar nada, dice qué filas entrarían, cada problema por línea y columna, lo ya importado (huella única por cuenta), y las categorías y métodos de pago por resolver. Límites de 1 MB y 5 000 filas. Además, un cuerpo demasiado grande o un JSON mal escrito ya no responden 500, sino 413 y 400.
