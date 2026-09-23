# Módulo Catálogo (`catalog`)

> Ficha del módulo. Estado: **en construcción** (hito H3). Hoy existen el esqueleto y las tablas `categories` y `payment_methods`; las reglas y los endpoints llegan con las tareas 02 (categorías) y 03 (métodos de pago). Flag **apagado**.

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

| Regla                        | Decisión                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clases                       | `ACCOUNT` (cuenta de ahorro o sueldo), `WALLET` (Yape, Plin), `CREDIT_CARD`, `CASH`                                                                                                                                         |
| Qué se guarda de una tarjeta | **Solo alias, banco y últimos 4 dígitos.** No existe columna para el número completo, el CVV ni el vencimiento, y `last4` solo acepta cuatro dígitos                                                                        |
| Moneda                       | **Opcional.** Una cuenta o billetera suele tener una (`PEN` o `USD`); una **tarjeta bimoneda** la deja vacía. Cada transacción lleva siempre su propia moneda. El detalle de líneas por moneda de una tarjeta queda para H5 |
| Borrar                       | Se archiva, como las categorías                                                                                                                                                                                             |

## Modelo de datos

- **Los enums van como `ENUM` nativo de PostgreSQL** (`transaction_type`, `payment_method_kind`, `currency`): la base rechaza un valor inválido aunque alguien se salte la aplicación. Agregar un valor es una migración trivial; quitar uno no, pero salen del glosario y son estables. El dominio define los suyos y no importa los de Prisma. Es la primera vez que el proyecto usa enums: los módulos siguientes siguen esta misma regla.
- **Lo que Prisma no sabe expresar vive solo en la migración** `catalog_categories_and_payment_methods`, y está comprobado que Prisma no lo intenta borrar en migraciones siguientes:
  - `categories_unique_sibling_name`: índice único sobre `(user_id, type, parent_id, lower(name))` con **`NULLS NOT DISTINCT`**. Sin eso, PostgreSQL trata cada `parent_id` nulo como distinto y permitiría dos `Comida` de primer nivel.
  - `CHECK` de nombre y alias no vacíos, de que una categoría no sea su propia madre, y del formato de `last4` (`^[0-9]{4}$`).
- **Lo que la base no puede exigir** y queda para el dominio (tarea 02): que una subcategoría no tenga hijas (habría que mirar otra fila) y el formato del color.
- Borrar un usuario borra sus categorías y métodos de pago (`onDelete: Cascade`).

## Eventos de dominio

- **Emite:** ninguno todavía.
- **Escucha:** el registro de un usuario, para crear su semilla de categorías (tarea 02).

## Endpoints

Llegan con las tareas 02 y 03 (`/api/v1/categories`, `/api/v1/payment-methods`).

## Estado

- Feature flag: `FEATURE_CATALOG` (**apagado** hasta cumplir la Definition of Done)
- Escenarios: [`features/catalog/`](../../features/catalog/)
- Web: el manifest está en el registro de navegación pero no se ve con el flag apagado. Si al cerrar H3 el catálogo sigue sin pantalla propia, sale del registro, como `identity`.
