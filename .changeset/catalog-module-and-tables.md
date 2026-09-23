---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Empieza el hito **H3**: nace el módulo `catalog` (apagado con `FEATURE_CATALOG=false`) con sus dos tablas, `categories` y `payment_methods`. Todavía no tiene endpoints.

Lo que la base ya exige por su cuenta, aunque alguien se salte la aplicación:

- Una subcategoría cuelga de una categoría **del mismo usuario y del mismo tipo**.
- No hay dos categorías hermanas con el mismo nombre en el mismo tipo, **sin distinguir mayúsculas** y contando las archivadas.
- De una tarjeta solo se guardan **alias, banco y últimos 4 dígitos**. La moneda es opcional, para las tarjetas bimoneda.

Es también la primera vez que el proyecto usa enums (`transaction_type`, `payment_method_kind`, `currency`), y van como `ENUM` nativo de PostgreSQL.
