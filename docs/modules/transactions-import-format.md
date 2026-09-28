# Formato para importar transacciones (CSV)

> Formato oficial de la importación (tarea 07b de H3). Decidido con el autor el 2026-09-27 y el 2026-09-28. Lo lee `readCsv` e `interpretImportRow` (`packages/domain`), con mutation testing al 100 %.

Sol a Sol importa las transacciones desde **un solo formato de CSV**, igual para todos. Si tus datos están en otra hoja de cálculo, conviértelos una vez a este formato. La importación te muestra antes qué entraría y qué no, fila por fila, para que lo revises antes de confirmar.

## En resumen

- La primera fila es la **cabecera**, con los nombres de columna de abajo.
- Cada fila siguiente es **una transacción** o **una transferencia**.
- Fechas `AAAA-MM-DD`, montos positivos con **punto decimal** y moneda en su propia columna.
- Se guarda en **UTF-8** (en Excel: _Guardar como → CSV UTF-8_).
- Hasta **1 MB** y **5 000 filas** por archivo.

## Plantilla

Copia esta línea como primera fila de tu archivo:

```csv
fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas
```

## Columnas

| Columna         | Obligatoria | Ejemplo             | Qué va                                                                                          |
| --------------- | ----------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `fecha`         | Sí          | `2026-09-17`        | Día en que pasó, `AAAA-MM-DD`. Hoy o antes, nunca una fecha futura                              |
| `tipo`          | Sí          | `Gasto variable`    | Uno de los tipos de la tabla de abajo                                                           |
| `categoria`     | Sí\*        | `Comida`            | Nombre de la categoría, del mismo tipo que la transacción                                       |
| `subcategoria`  | No          | `Delivery`          | Nombre de una subcategoría de esa categoría. Vacío = la categoría a secas                       |
| `monto`         | Sí          | `25.90`             | Siempre positivo; el tipo dice si entra o sale. Máximo 2 decimales                              |
| `moneda`        | Sí          | `PEN`               | `PEN` (soles) o `USD` (dólares)                                                                 |
| `descripcion`   | Sí          | `Almuerzo`          | Qué fue. Hasta 200 caracteres                                                                   |
| `metodo_pago`   | No\*        | `Sueldo BCP`        | Alias de un método de pago de tu cuenta. Vacío = sin método                                     |
| `comercio`      | No          | `TAMBO`             | Dónde fue. Hasta 80 caracteres                                                                  |
| `destino`       | No\*        | `Yape`              | Solo en una transferencia: alias de la cuenta a la que llega la plata                           |
| `monto_destino` | No\*        | `10.00`             | Solo en una transferencia que **cambia de moneda**: lo que llegó, copiado del voucher del banco |
| `etiquetas`     | No          | `almuerzo\|oficina` | Las que quieras, separadas por `\|`                                                             |

\* En una **transferencia** cambia: `categoria`, `subcategoria`, `comercio` y `etiquetas` van vacías; `metodo_pago` (de dónde sale) y `destino` (a dónde llega) son obligatorios. Ver [Transferencias](#transferencias).

- Las columnas pueden ir **en cualquier orden**: se reconocen por el nombre de la cabecera.
- En los nombres de columna **no importan las mayúsculas, las tildes, los espacios ni los guiones**: `Método de pago`, `METODO_PAGO` y `metodo pago` son la misma columna. Si una columna aparece dos veces, vale la primera.
- En los valores de `tipo`, `categoria`, `subcategoria` y `metodo_pago` tampoco importan las mayúsculas ni las tildes. La ñ sí cuenta como letra distinta.
- Si falta una de las columnas obligatorias (`fecha`, `tipo`, `monto`, `moneda`, `descripcion`), se rechaza el archivo entero, antes de leer las filas.
- Una columna que no está en la tabla (por ejemplo, un "Mes" o un "Presupuesto" de tu hoja) **se ignora**, y la previsualización la avisa por si era un error de tipeo.

### Tipos

| En el CSV        | Qué es                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `Ingreso`        | Plata que entra: sueldo, honorarios, ventas                         |
| `Gasto fijo`     | Lo que se paga todos los meses: alquiler, servicios                 |
| `Gasto variable` | Lo del día a día: comida, transporte, salidas                       |
| `Ahorro`         | Plata que se aparta                                                 |
| `Inversión`      | Plata que se invierte                                               |
| `Deuda`          | Pago de un préstamo, intereses y comisiones                         |
| `Transferencia`  | Plata que pasa de una cuenta tuya a otra (también pagar la tarjeta) |

**"Egreso" o "Gasto" a secas no se aceptan:** hay que elegir entre gasto fijo, gasto variable, ahorro, inversión o deuda, porque el presupuesto y los resúmenes los cuentan distinto. Una forma práctica de convertirlos: decidir el tipo según la categoría (todo "Alquiler" es gasto fijo, todo "Comida" es gasto variable).

## Transferencias

Pasar plata de una cuenta tuya a otra (del banco a Yape, de Yape a efectivo, de la cuenta a la tarjeta) **no es un ingreso ni un gasto**: no cambia cuánto tienes, solo dónde está. Por eso no se cuenta en los ingresos, los gastos ni la tasa de ahorro, pero sí queda registrada para poder revisar los movimientos de cada cuenta.

```csv
fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas
2026-09-04,Transferencia,,,50.00,PEN,Paso a Yape,BCP Digital Soles,,BCP Yape Soles,,
2026-09-10,Transferencia,,,37.50,PEN,Dólares para Netflix,Interbank Simple Soles,,Interbank Simple Dólares,10.00,
```

- Una transferencia es **una sola fila**, con origen y destino. Si tu hoja la anotó como dos filas (un "ingreso" en una cuenta y un "gasto" en la otra), júntalas en una.
- `monto` y `moneda` son lo que **salió**. Si la moneda cambia (soles a dólares), `monto_destino` es lo que **llegó**, copiado del voucher: nunca se convierte.

## Etiquetas

La categoría dice **qué** fue (una sola por transacción, y es lo que se presupuesta). Las etiquetas sirven para mirar tus gastos **desde otro ángulo**: por momento del día (`desayuno`, `almuerzo`), por viaje (`viaje-cusco`), por con quién. Una transacción puede tener hasta 10, separadas por `|`: `almuerzo|oficina`. No importan las mayúsculas ni las tildes.

## Montos

| Se acepta  | No se acepta | Por qué                                                                     |
| ---------- | ------------ | --------------------------------------------------------------------------- |
| `25.90`    | `25,90`      | La coma decimal se confunde con la de miles                                 |
| `25`       | `-25.90`     | El signo lo da el tipo: un gasto se escribe en positivo                     |
| `1,234.50` | `1.234,50`   | Formato ambiguo: se rechaza en vez de adivinar                              |
| `S/ 25.90` | `25.905`     | Un tercer decimal suele ser un dato mal copiado: se rechaza, no se redondea |

Un símbolo en el monto (`S/`, `US$`) tiene que coincidir con la columna `moneda`: `US$ 20` con moneda `PEN` se rechaza.

## Separadores y comillas

- Se acepta **coma** o **punto y coma** como separador; se detecta con la cabecera. (Excel en español a veces guarda con `;`).
- Un valor que tenga el separador, comillas o un salto de línea va **entre comillas dobles**, y una comilla dentro se escribe doble: `"Menú ""ejecutivo"", 2 platos"`.
- Las filas vacías se saltan.
- Se acepta el archivo con o sin la marca BOM que agrega Excel, y con finales de línea de Windows o de Unix.

## Ejemplo

```csv
fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas
2026-09-01,Ingreso,Sueldo o Salario,,4500.00,PEN,Sueldo de septiembre,BCP Digital Soles,,,,
2026-09-02,Gasto fijo,Vivienda,Alquiler,1200.00,PEN,Alquiler septiembre,BCP Digital Soles,,,,
2026-09-03,Gasto variable,Comida,Delivery,32.50,PEN,Pizza,BCP Yape Soles,Rappi,,,cena
2026-09-04,Transferencia,,,50.00,PEN,Paso a Yape,BCP Digital Soles,,BCP Yape Soles,,
2026-09-05,Ahorro,Fondo de emergencia,,500.00,PEN,Aporte mensual,,,,,
2026-09-08,Gasto variable,Comida,Restaurantes,12.00,PEN,Menú,BCP Yape Soles,,,,almuerzo|oficina
2026-09-10,Transferencia,,,37.50,PEN,Dólares para Netflix,Interbank Simple Soles,,Interbank Simple Dólares,10.00,
2026-09-10,Gasto fijo,Suscripciones,Netflix,10.00,USD,Netflix,Interbank Simple Dólares,Netflix,,,
```

## Cómo se importa

1. **Previsualizar.** Mandas el archivo y ves, sin que se guarde nada, cuántas filas se leyeron, cuáles entrarían y cuáles tienen problemas, **cada una con su número de línea, su columna y el motivo**.
2. **Resolver lo que no existe en tu cuenta.** La previsualización lista:
   - cada **categoría o subcategoría** del archivo que no existe: para cada una eliges **crearla** o **usar una que ya tienes** en su lugar ("Servicios > Bitel" puede ir a "Vivienda > Comunicaciones");
   - cada **método de pago** (o destino) cuyo alias no existe: eliges **uno que ya tienes** ("Transferencia" → "BCP Digital Soles") o **creas uno nuevo** en ese momento, con su tipo, banco, moneda y últimos 4 si es tarjeta, con las mismas reglas que al crearlo a mano.

   Así un error de tipeo ("Comdia") se ve antes de crear nada.

3. **Confirmar.** Entra **todo o nada**: si alguna fila tiene un problema, se corrige el archivo y se vuelve a mandar.

Las transacciones y transferencias importadas quedan marcadas con origen **`IMPORT`**, y se distinguen de las registradas a mano aunque después se corrijan.

### Importar dos veces el mismo archivo no duplica

Cada fila importada guarda una **huella de su fila original**: fecha, tipo, monto, moneda, descripción y comercio (en una transferencia, sus dos cuentas), sin mayúsculas ni tildes. Al volver a importar, una fila con una huella ya guardada se muestra como **ya importada** y se omite, **aunque después hayas corregido esa transacción**. La base lo garantiza incluso con dos importaciones a la vez.

Si el archivo trae dos filas idénticas (dos pasajes iguales el mismo día), entran las dos: la huella lleva el número de aparición. Al volver a importarlo, las dos se reconocen.

### Qué se rechaza

- Una celda obligatoria vacía (`fecha`, `tipo`, `monto`, `moneda`, `descripcion`; en una transacción, `categoria`; en una transferencia, `metodo_pago` y `destino`).
- Una fecha que no existe, que no está en formato `AAAA-MM-DD` o que es futura.
- Un tipo que no es uno de los de la tabla.
- Una categoría que existe pero es de otro tipo, o una subcategoría que existe bajo otra categoría.
- Un método de pago o un destino archivado.
- Una transferencia con los dos lados iguales, o con categoría, comercio o etiquetas; una transacción con `destino` o `monto_destino`.
- Un monto cero, negativo, con más de 2 decimales, en formato ambiguo, o con un símbolo que no coincide con la moneda.
- Una moneda que no es `PEN` ni `USD`.
- Una descripción o un comercio demasiado largos.
- Una etiqueta vacía (`almuerzo||cena`), o más de 10 en una transacción.

## Privacidad

El archivo **no se guarda**: se lee, se procesa y se descarta. Solo quedan las transacciones que confirmes.
