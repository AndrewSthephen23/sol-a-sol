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

  # --- Resumen mensual (H6): el cierre del mes. Reglas del 2026-10-03, ver docs/modules/reports.md.
  # Lo que vive en las consultas de Prisma (los totales por comercio, otra cuenta con los mismos
  # nombres) lo cubren las pruebas de integración de apps/api/test/reports/.

  Regla: El cierre de un mes cerrado se compara con el anterior entero; el mes en curso, hasta el mismo día

    Escenario: Setiembre cerrado contra todo agosto
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 40.00" en "Comida" el 20/08/2026
      Y que gasté "S/ 110.00" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces el cierre va del 01/09/2026 al 30/09/2026 y se compara con el 01/08/2026 al 31/08/2026
      Y en el cierre, el gasto variable en soles va de "S/ 40.00" a "S/ 110.00" (+175.00 %)

    Escenario: El mes en curso, del 1 a hoy, contra el anterior hasta el mismo día
      Dado que hoy es 03/10/2026 en Lima
      Y que gasté "S/ 30.00" en "Comida" el 02/09/2026
      Y que gasté "S/ 99.00" en "Comida" el 20/09/2026
      Y que gasté "S/ 10.00" en "Comida" el 01/10/2026
      Cuando veo el cierre de octubre de 2026
      Entonces el cierre va del 01/10/2026 al 03/10/2026 y se compara con el 01/09/2026 al 03/09/2026
      Y en el cierre, el gasto variable en soles va de "S/ 30.00" a "S/ 10.00" (-66.67 %)

    Escenario: Lo que antes fue cero no tiene porcentaje
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 500.00" en "Ahorro" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces en el cierre, el ahorro en soles va de "S/ 0.00" a "S/ 500.00" (sin porcentaje)

    Escenario: Un mes que todavía no empieza no tiene cierre
      Dado que hoy es 03/10/2026 en Lima
      Cuando intento ver el cierre de noviembre de 2026
      Entonces se rechaza con "SUMMARY_MONTH_IN_FUTURE"

  Regla: La tasa de ahorro incluye la inversión; sin ingresos no hay

    Escenario: Ahorro e inversión sobre lo que entró
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 3,000.00" en "Sueldo" el 01/09/2026
      Y que gasté "S/ 300.00" en "Ahorro" el 02/09/2026
      Y que gasté "S/ 200.00" en "Inversiones" el 03/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces la tasa de ahorro del cierre en soles es 16.67 %

    Escenario: Sin ingresos no hay tasa
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 300.00" en "Ahorro" el 02/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces no hay tasa de ahorro del cierre en soles

  Regla: Los tops son de gasto; los comercios se juntan sin tildes ni mayúsculas

    Escenario: El mismo comercio escrito de varias formas
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 20.00" en "Comida" en "Café Ñaña" el 05/09/2026
      Y que gasté "S/ 30.00" en "Comida" en "CAFE ÑAÑA" el 06/09/2026
      Y que gasté "S/ 30.00" en "Comida" en "CAFE ÑAÑA" el 07/09/2026
      Y que gasté "S/ 15.00" en "Comida" en "Tambo" el 08/09/2026
      Y que gasté "S/ 900.00" en "Sueldo" en "Empresa" el 01/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces los comercios donde más gasté en soles son:
        | comercio  | monto    | compras |
        | CAFE ÑAÑA | S/ 80.00 | 3       |
        | Tambo     | S/ 15.00 | 1       |

    Escenario: Las 5 categorías con más gasto, empatadas en orden estable
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté esto en septiembre de 2026:
        | categoría  | monto    |
        | Comida     | S/ 80.00 |
        | Transporte | S/ 50.00 |
        | Salud      | S/ 20.00 |
        | Ropa       | S/ 20.00 |
        | Cine       | S/ 10.00 |
        | Libros     | S/ 5.00  |
      Cuando veo el cierre de septiembre de 2026
      Entonces las categorías donde más gasté en soles son "Comida, Transporte, Ropa, Salud, Cine"

  Regla: Del presupuesto cuentan solo los límites; sin presupuesto, se dice

    Escenario: Pasarse por un céntimo
      Dado que hoy es 15/10/2026 en Lima
      Y que presupuesté "S/ 100.00" para "Comida" en septiembre de 2026
      Y que gasté "S/ 100.01" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces en el cierre se ejecutó el 100.01 % del presupuesto en soles
      Y en el cierre me pasé en "Comida" por "S/ 0.01"

    Escenario: Justo en el límite no es pasarse
      Dado que hoy es 15/10/2026 en Lima
      Y que presupuesté "S/ 100.00" para "Comida" en septiembre de 2026
      Y que gasté "S/ 100.00" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces en el cierre no me pasé en ninguna partida

    Escenario: Un mes sin presupuesto lo dice
      Dado que hoy es 15/10/2026 en Lima
      Y que gasté "S/ 10.00" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces el cierre dice que no hay presupuesto

    Escenario: Un presupuesto solo de lo que espero ganar no tiene límites
      Dado que hoy es 15/10/2026 en Lima
      Y que presupuesté "S/ 3,000.00" para "Sueldo" en septiembre de 2026
      Y que gasté "S/ 10.00" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces el cierre dice que no hay presupuesto

  Regla: De las tarjetas, lo cargado en el mes y el estado que vence el mes siguiente, a la fecha de corte

    Escenario: Consumo del mes y lo que falta del estado de setiembre
      Dado que hoy es 15/10/2026 en Lima
      Y que tengo la tarjeta "Visa" con una línea de "S/ 5,000.00", corte el día 20 y pago 25 días después del corte
      Y que compré "S/ 100.00" con la "Visa" el 25/08/2026
      Y que compré "S/ 200.00" con la "Visa" el 10/09/2026
      Y que compré "S/ 50.00" con la "Visa" el 22/09/2026
      Y que pagué "S/ 120.00" a la "Visa" desde "Sueldo BCP" el 25/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces en el cierre la "Visa" consumió "S/ 250.00"
      Y su estado del 20/09/2026 vence el 15/10/2026 y le falta pagar "S/ 180.00"

  Regla: De las metas, lo aportado en el mes y cómo quedó al cierre

    Escenario: Lo de octubre no cuenta en el cierre de setiembre
      Dado que hoy es 15/10/2026 en Lima
      Y que tengo la meta "Viaje" de "S/ 1,200.00" del 01/01/2026 al 31/12/2026
      Y que aporté "S/ 300.00" a "Viaje" el 15/09/2026
      Y que aporté "S/ 700.00" a "Viaje" el 05/10/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces en el cierre "Viaje" recibió "S/ 300.00" y llevaba "S/ 300.00"

  Regla: Un módulo apagado no aparece en el cierre

    Esquema del escenario: Sin <sección>
      Dado que hoy es 15/10/2026 en Lima
      Y que el módulo de <sección> está apagado
      Y que gasté "S/ 10.00" en "Comida" el 05/09/2026
      Cuando veo el cierre de septiembre de 2026
      Entonces el cierre no tiene <sección>

      Ejemplos:
        | sección     |
        | presupuesto |
        | tarjetas    |
        | metas       |

  # --- Resumen anual (H6): el año mes a mes. Reglas del 2026-10-03, ver docs/modules/reports.md.

  Regla: Cada mes en su columna, con los meses que no llegan vacíos

    Escenario: El año en curso
      Dado que hoy es 03/10/2026 en Lima
      Y que gasté "S/ 1,000.00" en "Sueldo" el 05/03/2026
      Y que gasté "S/ 100.00" en "Comida" el 10/01/2026
      Y que gasté "S/ 50.00" en "Comida" el 30/09/2026
      Cuando veo el año 2026
      Entonces en el año, el gasto variable en soles de enero es "S/ 100.00"
      Y en el año, el gasto variable en soles de septiembre es "S/ 50.00"
      Y en el año, el gasto variable en soles de febrero es "S/ 0.00"
      Y en el año, el gasto variable en soles de noviembre está vacío
      Y en el año, el gasto variable en soles suma "S/ 150.00"
      Y en el año, el saldo en soles suma "S/ 850.00"
      Y la tasa de ahorro del año en soles es 0.00 %

    Escenario: Diciembre y enero de un año cerrado
      Dado que hoy es 03/10/2026 en Lima
      Y que gasté "S/ 20.00" en "Comida" el 31/12/2025
      Y que gasté "S/ 30.00" en "Comida" el 01/01/2025
      Cuando veo el año 2025
      Entonces en el año, el gasto variable en soles de diciembre es "S/ 20.00"
      Y en el año, el gasto variable en soles de enero es "S/ 30.00"
      Y no hay tasa de ahorro del año en soles

    Escenario: Un año que todavía no empieza no tiene resumen
      Dado que hoy es 03/10/2026 en Lima
      Cuando intento ver el año 2027
      Entonces se rechaza con "SUMMARY_YEAR_IN_FUTURE"
