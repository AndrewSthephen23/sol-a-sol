# Módulo Catálogo (`catalog`)

> Ficha del módulo. Estado: **en construcción** (hito H3). **Categorías** con su semilla (tarea 02) y **métodos de pago** (tarea 03) completos en la API. Flag **apagado**.

## Qué resuelve

Con qué palabras se ordena la plata. Una transacción sin categoría no dice en qué se fue el dinero,
y sin método de pago no se sabe qué tarjeta se está usando: presupuesto (H4), tarjetas (H5) y
resúmenes (H6) agrupan por estas dos cosas. Por eso este módulo va antes que `transactions`.

## Reglas de negocio

Decididas con el autor el 2026-09-23. No se cambian sin volver a preguntar.

### Categorías

Decididas con el autor el 2026-09-23 (tarea 01) y el 2026-09-24 (tarea 02).

| Regla                | Decisión                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| De quién son         | **De cada usuario.** Cada uno crea las suyas y edita su copia de la semilla sin afectar a nadie                                                                                                                                                              |
| Tipo                 | Cada categoría pertenece a **un solo tipo** de transacción (`INCOME`, `FIXED_EXPENSE`, `VARIABLE_EXPENSE`, `SAVING`, `INVESTMENT`, `DEBT`). Una de primer nivel **lo exige** (`CATEGORY_TYPE_REQUIRED`)                                                      |
| Jerarquía            | **Un solo nivel:** categoría → subcategoría. Colgar una hija de una subcategoría se rechaza (`CATEGORY_TOO_DEEP`). Lo exige el dominio: la base no puede mirar otra fila                                                                                     |
| Subcategoría         | Del **mismo usuario y del mismo tipo** que su madre (clave foránea compuesta en la base). **Hereda el tipo**: mandar otro es un error (`SUBCATEGORY_TYPE_MISMATCH`), no algo que se corrige en silencio. Si no trae color o ícono, **toma los de su madre**  |
| Color e ícono        | Color `#RRGGBB` (`INVALID_CATEGORY_COLOR`, y un `CHECK` en la base); ícono en kebab-case (`shopping-cart`), el nombre de un ícono de la web. Sin ellos, una de primer nivel recibe `#607D8B` y `tag`                                                         |
| Nombre repetido      | Único entre hermanas **del mismo tipo**, **sin distinguir mayúsculas ni acentos**: `Café` = `cafe` = `CAFÉ` (`CATEGORY_NAME_TAKEN`, 409). **La ñ no es un acento**: `Año` y `Ano` son distintas. `Otros` puede existir como gasto fijo y como gasto variable |
| Archivadas y nombres | **Las archivadas cuentan** para la unicidad: para volver a usar un nombre se restaura la archivada, y su historial sigue junto                                                                                                                               |
| Borrar               | **No hay `DELETE`: se archiva** (`archivedAt`), porque sus transacciones siguen apuntando a ella. Una archivada no se ofrece para transacciones nuevas, pero **sigue en las viejas y en los informes**: archivar no reescribe el pasado                      |
| Archivar una madre   | **Archiva sus hijas activas**, con la misma fecha exacta, en una sola transacción                                                                                                                                                                            |
| Restaurar una madre  | Devuelve **solo las hijas que se archivaron con ella** (misma fecha); las que ya estaban archivadas antes siguen así                                                                                                                                         |
| Restaurar una hija   | **No, mientras su madre siga archivada** (`PARENT_CATEGORY_ARCHIVED`): primero se restaura la madre. Tampoco se crea una hija nueva bajo una madre archivada                                                                                                 |
| Cambiar tipo o madre | **No se puede.** Sus transacciones quedarían con otro tipo que su categoría (la base lo impide). Si está mal clasificada, se archiva y se crea otra                                                                                                          |
| Semilla              | Se crea **al registrarse** cada usuario (evento de registro: `identity` no importa `catalog`), y `pnpm db:seed` la aplica a las cuentas **sin ninguna categoría**, nunca a las que ya tienen alguna. Llega en un PR aparte (ver abajo)                       |

#### La semilla

Lista decidida con el autor el 2026-09-24. Trae **solo lo nombrado**: el resto lo crea cada usuario. Vive en `apps/api/src/modules/catalog/domain/default-categories.ts`, con color e ícono (de Lucide) para cada una; las subcategorías toman el color de su madre. Una prueba comprueba que la lista siga siendo esta y que cada entrada la aceptaría la API.

- **Al registrarse:** `catalog` escucha `identity.user.registered` ([ADR-0004](../adr/0004-eventos-de-dominio.md)) y siembra la cuenta nueva antes de que responda el registro. **Siembra aunque `FEATURE_CATALOG` esté apagado**: el flag decide qué se expone, no qué datos existen. Así, al encenderlo, cada cuenta ya tiene sus categorías.
- **Si la semilla falla al registrarse**, el registro sigue (la cuenta ya existe) y el error queda en el log. `pnpm db:seed` la completa después.
- **`pnpm db:seed`** siembra las cuentas **sin ninguna categoría** y no toca a las que ya tienen alguna, aunque sea una sola: ni completa ni mezcla. Es idempotente y se puede correr las veces que haga falta.
  - **En desarrollo:** `pnpm db:seed`, que usa el `DATABASE_URL` del entorno o, si no hay, el de `apps/api/.env`.
  - **En la imagen de producción:** `node dist/seed.js`. **Nunca corre sola**: es un comando explícito.
  - Arranca solo el módulo del catálogo, sin servidor HTTP, y usa los mismos casos de uso que la API.
- **Cada cuenta se siembra en una sola transacción:** o quedan las 34, o ninguna. Si dos semillas coinciden sobre la misma cuenta, el índice único frena los duplicados.

| Tipo           | Categorías (y subcategorías)                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingreso        | Sueldo o Salario · Depósitos                                                                                                                                         |
| Gasto fijo     | Vivienda (Alquiler, Luz, Agua, Internet, Comunicaciones) · Suscripciones (Netflix, Spotify)                                                                          |
| Gasto variable | Comida (Supermercado, Restaurantes, Delivery) · Transporte (Taxi, Combustible) · Entretenimiento · Deportes · Facturas · Higiene · Mascotas · Ropa · Regalos · Salud |
| Ahorro         | Fondo de emergencia · Cuenta de ahorro · Depósito a plazo · CTS                                                                                                      |
| Inversión      | Acciones · ETFs                                                                                                                                                      |
| Deuda          | Préstamo · Tarjeta de crédito                                                                                                                                        |

### Métodos de pago

Decididas con el autor el 2026-09-23 (tarea 03).

| Regla                        | Decisión                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos                        | `ACCOUNT` (cuenta de ahorro o sueldo), `WALLET` (Yape, Plin), `CREDIT_CARD`, `CASH`                                                                                                                                                                                                                             |
| Qué se guarda de una tarjeta | **Solo alias, banco y últimos 4 dígitos** (ver más abajo por qué)                                                                                                                                                                                                                                               |
| Últimos 4 dígitos            | **Exactamente cuatro**; un número más largo **se rechaza, no se recorta**. **Obligatorios en una tarjeta de crédito** (las notificaciones del banco y Apple Pay la nombran por ellos, y H7 los usará para reconocerla), **opcionales en una cuenta**, y **no existen** en una billetera ni en el efectivo       |
| Moneda                       | **Obligatoria en cuentas y billeteras**, que guardan una sola. **Opcional** en una tarjeta (bimoneda) y en el efectivo, y vacía significa que acepta las dos. Solo sirve de valor por defecto al registrar una transacción: **no convierte nada**. El detalle de líneas por moneda de una tarjeta queda para H5 |
| Banco                        | Opcional. **El efectivo no tiene banco**                                                                                                                                                                                                                                                                        |
| Alias                        | **Único por usuario, sin distinguir mayúsculas y contando los archivados**: es lo que se ve al registrar un gasto, y dos iguales serían indistinguibles. Para reusar un alias se restaura el archivado                                                                                                          |
| Editar                       | **Todo menos el tipo.** En H5 una tarjeta tendrá datos propios (línea, día de corte) colgados de ella; si el tipo está mal, se archiva y se crea otro. Las reglas se comprueban sobre el método **como quedaría**, no solo sobre lo que cambia                                                                  |
| Borrar                       | **No hay `DELETE`: se archiva.** Un método archivado no se ofrece al registrar, pero sigue apareciendo en lo ya registrado. Archivar lo ya archivado conserva la fecha original                                                                                                                                 |
| Quién                        | Solo desde una sesión. Un token personal (el del celular) recibe **403**: sirve para mandar capturas, no para tocar el catálogo                                                                                                                                                                                 |

#### Por qué no se guarda nada más de una tarjeta

Es una regla del proyecto entero (`CLAUDE.md`), no solo de este módulo. **Lo que no se guarda no se
puede filtrar.** Para saber con qué se pagó bastan el alias y los últimos 4 dígitos: así la nombran
el extracto, las notificaciones del banco y Apple Pay. El número completo, el CVV y el vencimiento
sirven solo para **cobrar** con la tarjeta, algo que esta plataforma nunca hace. Guardarlos
convertiría una base de datos personal en un blanco, y además la dejaría sujeta a PCI DSS.

Por eso la regla se protege en capas. Ninguna depende de las otras:

1. **El contrato** es estricto: un campo desconocido (`cardNumber`, `cvv`, `expiresAt`) se rechaza con 422 en vez de ignorarse.
2. **El dominio** rechaza un `last4` que no sean exactamente cuatro dígitos, y **nunca lo recorta**. Recortarlo sería aceptar en silencio que alguien mandó el número completo.
3. **La base** no tiene columna para nada más, y un `CHECK` exige el formato. Una prueba de integración lee las columnas de la tabla en `information_schema` y falla si aparece una nueva.

## Modelo de datos

- **Los enums van como `ENUM` nativo de PostgreSQL** (`transaction_type`, `payment_method_kind`, `currency`): la base rechaza un valor inválido aunque alguien se salte la aplicación. Agregar un valor es una migración trivial; quitar uno no, pero salen del glosario y son estables. El dominio define los suyos y no importa los de Prisma. Es la primera vez que el proyecto usa enums: los módulos siguientes siguen esta misma regla.
- **Lo que Prisma no sabe expresar vive solo en las migraciones** `catalog_categories_and_payment_methods` y `catalog_payment_method_rules`, y está comprobado que Prisma no lo intenta borrar en migraciones siguientes:
  - `categories_unique_sibling_name`: índice único sobre `(user_id, type, parent_id, lower(name))` con **`NULLS NOT DISTINCT`**. Sin eso, PostgreSQL trata cada `parent_id` nulo como distinto y permitiría dos `Comida` de primer nivel.
  - `CHECK` de nombre y alias no vacíos, de que una categoría no sea su propia madre, y del formato de `last4` (`^[0-9]{4}$`).
  - `payment_methods_unique_alias`: índice único sobre `(user_id, lower(alias))`.
  - `payment_methods_last4_by_kind`, `payment_methods_currency_by_kind` y `payment_methods_institution_by_kind`: las reglas por tipo de la tabla de arriba. El dominio las aplica primero; en la base son la red por si alguien se lo salta.
- **Lo que la base no puede exigir** y queda para el dominio: que una subcategoría no tenga hijas (habría que mirar otra fila) y las reglas de archivado en cascada.
- `categories_unique_sibling_name` se rehízo en `catalog_category_names_ignore_accents` para ignorar también los acentos. La tabla de acentos está **dos veces**: en el índice y en `categoryNameKey` (dominio). Una prueba de integración comprueba que coincidan. El índice traduce las mayúsculas acentuadas antes de `lower`, para no depender del locale de la base (con el locale `C`, `lower('É')` devuelve `'É'`).
- `categories_color_format`: `CHECK` de `#RRGGBB`.
- Borrar un usuario borra sus categorías y métodos de pago (`onDelete: Cascade`).

## Eventos de dominio

- **Emite:** ninguno todavía.
- **Escucha:** `identity.user.registered`, para sembrar las categorías iniciales de la cuenta nueva.

## API pública para otros módulos

`CatalogLookup` (exportado por `index.ts`) responde, para una cuenta, **el tipo y si está archivada** una categoría, y **la moneda y si está archivado** un método de pago; `null` si no existe o es ajeno. Lo usa `transactions` para validar una transacción sin leer estas tablas. Devuelve lo mínimo a propósito: quien consulta no queda atado a la forma de las entidades.

## Endpoints

Todos exigen una sesión (`Authorization: Bearer <token de acceso>`), filtran por el `userId` del token y responden **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método  | Ruta                           | Qué hace                                                                                                          |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/v1/categories`           | Lista las categorías anidadas por nombre; `?type=` filtra y `?includeArchived=true` suma las archivadas           |
| `POST`  | `/api/v1/categories`           | Crea una categoría o, con `parentId`, una subcategoría. **409** si el nombre choca                                |
| `PATCH` | `/api/v1/categories/{id}`      | Renombra, cambia color o ícono, y archiva o restaura (en cascada) con `archived`. **404** si no existe o es ajena |
| `GET`   | `/api/v1/payment-methods`      | Lista los métodos de la cuenta por alias; `?includeArchived=true` suma los archivados                             |
| `POST`  | `/api/v1/payment-methods`      | Registra uno. **409** si el alias ya existe; **422** si rompe una regla de su tipo                                |
| `PATCH` | `/api/v1/payment-methods/{id}` | Corrige cualquier campo menos el tipo, y archiva o restaura con `archived`. **404** si no existe o es ajeno       |

### Errores

| `code`                             | Estado | Cuándo                                                                                |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `INVALID_LAST4`                    | 422    | Los últimos 4 no son exactamente cuatro dígitos                                       |
| `LAST4_REQUIRED`                   | 422    | Una tarjeta de crédito sin sus últimos 4                                              |
| `LAST4_NOT_ALLOWED`                | 422    | Últimos 4 en una billetera o en el efectivo                                           |
| `PAYMENT_METHOD_CURRENCY_REQUIRED` | 422    | Una cuenta o billetera sin moneda                                                     |
| `INSTITUTION_NOT_ALLOWED`          | 422    | Efectivo con banco                                                                    |
| `PAYMENT_METHOD_ALIAS_TAKEN`       | 409    | El alias ya existe, sin distinguir mayúsculas y contando archivados                   |
| `PAYMENT_METHOD_NOT_FOUND`         | 404    | No existe o es de otra cuenta                                                         |
| `CATEGORY_TYPE_REQUIRED`           | 422    | Una categoría de primer nivel sin tipo                                                |
| `SUBCATEGORY_TYPE_MISMATCH`        | 422    | Una subcategoría con un tipo distinto al de su madre                                  |
| `CATEGORY_TOO_DEEP`                | 422    | Una subcategoría usada como madre                                                     |
| `PARENT_CATEGORY_ARCHIVED`         | 422    | Restaurar una hija, o crear una nueva, con la madre archivada                         |
| `INVALID_CATEGORY_COLOR`           | 422    | El color no es `#RRGGBB`                                                              |
| `CATEGORY_NAME_TAKEN`              | 409    | Una hermana del mismo tipo ya se llama así, sin mayúsculas ni acentos, archivada o no |
| `CATEGORY_NOT_FOUND`               | 404    | La categoría, o la madre elegida, no existe o es de otra cuenta                       |

## Estado

- Feature flag: `FEATURE_CATALOG` (**apagado** hasta cumplir la Definition of Done)
- Escenarios: [`features/catalog/`](../../features/catalog/)
- Web: el manifest está en el registro de navegación pero no se ve con el flag apagado. Si al cerrar H3 el catálogo sigue sin pantalla propia, sale del registro, como `identity`.
