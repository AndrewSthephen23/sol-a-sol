# language: es
Característica: Resumen del mes
  Para saber cómo voy sin revisar movimiento por movimiento
  Como dueño de mis finanzas
  Quiero ver el mes en números y gráficos, por moneda

  # Reglas decididas con el autor el 2026-09-29 (ver docs/modules/reports.md).
  # Hoy es el 24/09/2026 en Lima, salvo que el escenario diga otra cosa.

  Regla: Los KPIs usan las reglas de todo el producto y van por moneda

    Escenario: Ingresos, gastos, ahorro, deuda y saldo del mes
      Dado que registré estos movimientos:
        | fecha      | categoría   | monto       |
        | 01/09/2026 | Sueldo      | S/ 4,000.00 |
        | 02/09/2026 | Alquiler    | S/ 1,500.00 |
        | 03/09/2026 | Comida      | S/ 500.00   |
        | 04/09/2026 | Ahorro      | S/ 300.00   |
        | 05/09/2026 | Inversiones | S/ 200.00   |
        | 06/09/2026 | Préstamo    | S/ 100.00   |
      Cuando veo el resumen de septiembre de 2026
      Entonces el resumen en soles es:
        | ingresos    | gastos      | ahorro    | deuda     | saldo       |
        | S/ 4,000.00 | S/ 2,000.00 | S/ 500.00 | S/ 100.00 | S/ 1,400.00 |
      Y no hay resumen en dólares

    Escenario: Soles y dólares van por separado, sin convertir
      Dado que registré estos movimientos:
        | fecha      | categoría | monto     |
        | 03/09/2026 | Comida    | S/ 50.00  |
        | 03/09/2026 | Comida    | US$ 20.00 |
      Cuando veo el resumen de septiembre de 2026
      Entonces el gasto en soles es "S/ 50.00"
      Y el gasto en dólares es "US$ 20.00"

    Escenario: Un mes sin movimientos no tiene resumen
      Cuando veo el resumen de septiembre de 2026
      Entonces no hay resumen del mes

  Regla: Las transferencias y lo borrado no cuentan

    Escenario: Mover plata entre mis cuentas no es gastar
      Dado que tengo la cuenta "Interbank" en soles
      Y que registré estos movimientos:
        | fecha      | categoría | monto    |
        | 03/09/2026 | Comida    | S/ 30.00 |
      Y transferí "S/ 500.00" de "Sueldo BCP" a "Interbank" el 05/09/2026
      Cuando veo el resumen de septiembre de 2026
      Entonces el gasto en soles es "S/ 30.00"
      Y el saldo en soles del resumen es "S/ -30.00"

    Escenario: Un gasto borrado no cuenta
      Dado que registré un gasto
      Y lo borro
      Cuando veo el resumen de septiembre de 2026
      Entonces no hay resumen del mes

  Regla: Una barra por día, con los días sin gasto en cero

    Escenario: Un mes pasado tiene todos sus días
      Dado que hoy es 15/10/2026 en Lima
      Y que registré estos movimientos:
        | fecha      | categoría | monto    |
        | 01/09/2026 | Comida    | S/ 10.00 |
        | 01/09/2026 | Alquiler  | S/ 5.00  |
        | 30/09/2026 | Comida    | S/ 15.00 |
      Cuando veo el resumen de septiembre de 2026
      Entonces hay 30 barras
      Y la barra del 01/09/2026 es "S/ 15.00"
      Y la barra del 02/09/2026 es "S/ 0.00"
      Y la barra del 30/09/2026 es "S/ 15.00"

    Escenario: El mes en curso llega hasta hoy
      Dado que hoy es 24/09/2026 en Lima
      Y que registré estos movimientos:
        | fecha      | categoría | monto    |
        | 01/09/2026 | Comida    | S/ 10.00 |
      Cuando veo el resumen de septiembre de 2026
      Entonces hay 24 barras

    Esquema del escenario: Un mes corto tiene sus días, ni uno más
      Dado que hoy es <hoy> en Lima
      Y que registré estos movimientos:
        | fecha   | categoría | monto   |
        | <fecha> | Comida    | S/ 5.00 |
      Cuando veo el resumen de <mes>
      Entonces hay <barras> barras

      Ejemplos:
        | hoy        | fecha      | mes               | barras |
        | 24/09/2026 | 10/02/2026 | febrero de 2026   | 28     |
        | 01/03/2028 | 10/02/2028 | febrero de 2028   | 29     |
        | 24/09/2026 | 10/04/2026 | abril de 2026     | 30     |

    Escenario: En las barras solo entra el gasto
      Dado que registré estos movimientos:
        | fecha      | categoría | monto       |
        | 01/09/2026 | Sueldo    | S/ 4,000.00 |
        | 01/09/2026 | Ahorro    | S/ 300.00   |
        | 01/09/2026 | Préstamo  | S/ 100.00   |
        | 01/09/2026 | Comida    | S/ 25.00    |
      Cuando veo el resumen de septiembre de 2026
      Entonces la barra del 01/09/2026 es "S/ 25.00"

  Regla: La dona muestra las 6 categorías con más gasto y junta el resto en «Otras»

    Escenario: Con más de 6 categorías, el resto va en «Otras»
      Dado que gasté esto en septiembre de 2026:
        | categoría  | monto    |
        | Comida     | S/ 80.00 |
        | Transporte | S/ 70.00 |
        | Salud      | S/ 60.00 |
        | Ropa       | S/ 50.00 |
        | Mascotas   | S/ 40.00 |
        | Regalos    | S/ 30.00 |
        | Cine       | S/ 20.00 |
        | Libros     | S/ 10.00 |
      Cuando veo el resumen de septiembre de 2026
      Entonces la dona en soles es:
        | porción    | monto    | parte   |
        | Comida     | S/ 80.00 | 22.22 % |
        | Transporte | S/ 70.00 | 19.44 % |
        | Salud      | S/ 60.00 | 16.67 % |
        | Ropa       | S/ 50.00 | 13.89 % |
        | Mascotas   | S/ 40.00 | 11.11 % |
        | Regalos    | S/ 30.00 | 8.33 %  |
        | Otras      | S/ 30.00 | 8.33 %  |

    Escenario: Con 6 categorías o menos no hay «Otras»
      Dado que gasté esto en septiembre de 2026:
        | categoría  | monto    |
        | Comida     | S/ 60.00 |
        | Transporte | S/ 40.00 |
      Cuando veo el resumen de septiembre de 2026
      Entonces la dona en soles es:
        | porción    | monto    | parte   |
        | Comida     | S/ 60.00 | 60.00 % |
        | Transporte | S/ 40.00 | 40.00 % |

    Escenario: Lo de una subcategoría va en la porción de su madre
      Dado que tengo la categoría "Comida" con la subcategoría "Mercado"
      Y que gasté esto en septiembre de 2026:
        | categoría | monto     |
        | Mercado   | S/ 120.00 |
        | Comida    | S/ 30.00  |
      Cuando veo el resumen de septiembre de 2026
      Entonces la dona en soles es:
        | porción | monto     | parte    |
        | Comida  | S/ 150.00 | 100.00 % |
