# Módulo Catálogo (`catalog`)

> Ficha del módulo. Estado: **en construcción** (hito H3). Los **métodos de pago** están completos en la API (tarea 03); las **categorías** tienen tabla, pero sus reglas y endpoints llegan con la tarea 02. Flag **apagado**.

## Qué resuelve

Con qué palabras se ordena la plata. Una transacción sin categoría no dice en qué se fue el dinero,
y sin método de pago no se sabe qué tarjeta se está usando: presupuesto (H4), tarjetas (H5) y
resúmenes (H6) agrupan por estas dos cosas. Por eso este módulo va antes que `transactions`.

## Reglas de negocio

Decididas con el autor el 2026-09-23. No se cambian sin volver a preguntar.

### Categorías

| Regla                | Decisión                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| De quién son         | **De cada usuario.** Cada uno tiene su propia copia y la edita sin afectar a nadie                                                                                                  |
| Tipo                 | Cada categoría pertenece a **un solo tipo** de transacción (`INCOME`, `FIXED_EXPENSE`, `VARIABLE_EXPENSE`, `SAVING`, `INVESTMENT`, `DEBT`)                                          |
| Jerarquía            | **Un solo nivel:** categoría → subcategoría. Una subcategoría no tiene hijas                                                                                                        |
| Subcategoría         | Del **mismo usuario y del mismo tipo** que su categoría. Lo exige la base con una clave foránea compuesta, no solo la aplicación                                                    |
| Nombre repetido      | Único entre hermanas **del mismo tipo**, **sin distinguir mayúsculas** (`Comida` = `comida`). `Otros` puede existir como gasto fijo y como gasto variable                           |
| Borrar               | **No se borra: se archiva** (`archivedAt`), porque sus transacciones siguen apuntando a ella. Una categoría con subcategorías tampoco se puede borrar en la base                    |
| Archivadas y nombres | **Las archivadas cuentan** para la unicidad: para volver a usar un nombre se restaura la archivada, y su historial sigue junto                                                      |
| Semilla              | Se crea **al registrarse** cada usuario, escuchando el evento de registro (`identity` no importa `catalog`). `pnpm db:seed` usa la misma lista en desarrollo. Llega con la tarea 02 |

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
- **Lo que la base no puede exigir** y queda para el dominio (tarea 02): que una subcategoría no tenga hijas (habría que mirar otra fila) y el formato del color.
- Borrar un usuario borra sus categorías y métodos de pago (`onDelete: Cascade`).

## Eventos de dominio

- **Emite:** ninguno todavía.
- **Escucha:** el registro de un usuario, para crear su semilla de categorías (tarea 02).

## Endpoints

Todos exigen una sesión (`Authorization: Bearer <token de acceso>`), filtran por el `userId` del token y responden **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método  | Ruta                           | Qué hace                                                                                                    |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/v1/payment-methods`      | Lista los métodos de la cuenta por alias; `?includeArchived=true` suma los archivados                       |
| `POST`  | `/api/v1/payment-methods`      | Registra uno. **409** si el alias ya existe; **422** si rompe una regla de su tipo                          |
| `PATCH` | `/api/v1/payment-methods/{id}` | Corrige cualquier campo menos el tipo, y archiva o restaura con `archived`. **404** si no existe o es ajeno |

Las categorías (`/api/v1/categories`) llegan con la tarea 02.

### Errores

| `code`                             | Estado | Cuándo                                                              |
| ---------------------------------- | ------ | ------------------------------------------------------------------- |
| `INVALID_LAST4`                    | 422    | Los últimos 4 no son exactamente cuatro dígitos                     |
| `LAST4_REQUIRED`                   | 422    | Una tarjeta de crédito sin sus últimos 4                            |
| `LAST4_NOT_ALLOWED`                | 422    | Últimos 4 en una billetera o en el efectivo                         |
| `PAYMENT_METHOD_CURRENCY_REQUIRED` | 422    | Una cuenta o billetera sin moneda                                   |
| `INSTITUTION_NOT_ALLOWED`          | 422    | Efectivo con banco                                                  |
| `PAYMENT_METHOD_ALIAS_TAKEN`       | 409    | El alias ya existe, sin distinguir mayúsculas y contando archivados |
| `PAYMENT_METHOD_NOT_FOUND`         | 404    | No existe o es de otra cuenta                                       |

## Estado

- Feature flag: `FEATURE_CATALOG` (**apagado** hasta cumplir la Definition of Done)
- Escenarios: [`features/catalog/`](../../features/catalog/)
- Web: el manifest está en el registro de navegación pero no se ve con el flag apagado. Si al cerrar H3 el catálogo sigue sin pantalla propia, sale del registro, como `identity`.
