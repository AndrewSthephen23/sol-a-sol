---
'@sol-a-sol/api': minor
'@sol-a-sol/web': minor
---

Cierra el hito **H3 — Catálogo y transacciones**: ya se registran gastos de verdad. Los módulos `catalog` y `transactions` quedan **encendidos** (`FEATURE_CATALOG=true`, `FEATURE_TRANSACTIONS=true`): categorías con su semilla, jerarquía, fusión y conversión en etiqueta; métodos de pago; transacciones con corrección, borrado que se deshace y listado con filtros, búsqueda, cursor y totales; transferencias entre cuentas propias; etiquetas; e importación CSV en dos pasos, todo o nada.

Es el primer hito con **interfaz**: inicio de sesión con segundo factor, la lista del mes, el formulario rápido pensado para el teléfono y la importación, con una política de contenido estricta con nonce. El aislamiento por usuario está probado en los 24 endpoints nuevos con la sesión de otra cuenta, y la checklist de OWASP ASVS queda al día.

La web **no** muestra todavía la gestión del catálogo: su flag tiene que estar encendido para que las transacciones tengan categorías y métodos, pero la pantalla `/catalog` quedó para después de H3, así que su manifest no está en la navegación.
