---
'@sol-a-sol/web': patch
---

La pantalla de la bandeja («Bandeja», `/capture`), todavía apagada (`FEATURE_CAPTURE=false`): lo que mandó el teléfono, primero lo más reciente, con sus avisos en palabras y el texto que llegó. Se confirma con un toque si está completa (con «Recordar la categoría para este comercio»), se corrige en la misma tarjeta, se descarta con «Deshacer» y se pueden confirmar todas las completas a la vez. Las descartadas se ven en su pestaña y se restauran.

Los campos de categoría y método de pago del formulario de movimientos pasan a `form-parts`, compartidos con la bandeja.
