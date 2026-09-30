# language: es
Característica: Tarjetas de crédito
  Para no pasarme de la línea ni pagar tarde
  Como dueño de mis finanzas
  Quiero saber en qué ciclo va cada tarjeta, cuánto debo, cuánto de la línea uso y cuándo pagar

  # Reglas decididas con el autor el 2026-09-29 y el 2026-09-30 (ver docs/modules/credit-cards.md).
  # Lo que se compró y se pagó sale de los movimientos registrados, como en la aplicación.
  # Lo que vive en las consultas de Prisma (borradas, otra cuenta, monto recibido de una
  # transferencia) lo cubren las pruebas de integración de apps/api/test/credit-cards/.

  Antecedentes:
    Dado que tengo la tarjeta "Visa" con una línea de "S/ 5,000.00", corte el día 20 y pago 25 días después del corte

  Regla: El día de corte cierra su ciclo

    Esquema del escenario: El ciclo que contiene un día
      Dado que hoy es <hoy> en Lima
      Cuando veo el estado de la "Visa"
      Entonces el ciclo actual va del <inicio> al <fin>

      Ejemplos:
        | hoy        | inicio     | fin        |
        | 10/09/2026 | 21/08/2026 | 20/09/2026 |
        | 20/09/2026 | 21/08/2026 | 20/09/2026 |
        | 21/09/2026 | 21/09/2026 | 20/10/2026 |
        | 05/01/2027 | 21/12/2026 | 20/01/2027 |

    Escenario: La compra del día de corte entra en el estado que cierra ese día
      Dado que hoy es 25/09/2026 en Lima
      Y que compré "S/ 100.00" con la "Visa" el 20/09/2026
      Y que compré "S/ 40.00" con la "Visa" el 21/09/2026
      Cuando veo el estado de la "Visa"
      Entonces el último estado de cuenta es de "S/ 100.00"

    Esquema del escenario: Un día de corte que el mes no tiene cae el último día
      Dado que tengo la tarjeta "Diners" con una línea de "S/ 1,000.00", corte el día 31 y pago 25 días después del corte
      Y que hoy es <hoy> en Lima
      Cuando veo el estado de la "Diners"
      Entonces el ciclo actual va del <inicio> al <fin>

      Ejemplos:
        | hoy        | inicio     | fin        |
        | 15/02/2026 | 01/02/2026 | 28/02/2026 |
        | 15/02/2028 | 01/02/2028 | 29/02/2028 |
        | 10/04/2026 | 01/04/2026 | 30/04/2026 |
        | 01/03/2026 | 01/03/2026 | 31/03/2026 |

  Regla: La fecha límite de pago sale de la regla de la tarjeta, sin mover fines de semana

    Escenario: Unos días después del corte
      Dado que hoy es 29/09/2026 en Lima
      Cuando veo el estado de la "Visa"
      Entonces la fecha límite de pago es el 15/10/2026, en 16 días

    Escenario: Un día fijo que no cae después del corte es del mes siguiente
      Dado que tengo la tarjeta "Amex" con una línea de "S/ 1,000.00", corte el día 20 y pago el día 5 de cada mes
      Y que hoy es 29/09/2026 en Lima
      Cuando veo el estado de la "Amex"
      Entonces la fecha límite de pago es el 05/10/2026, en 6 días

    Escenario: Un vencimiento en domingo se queda en domingo
      Dado que tengo la tarjeta "Diners" con una línea de "S/ 1,000.00", corte el día 20 y pago 28 días después del corte
      Y que hoy es 29/09/2026 en Lima
      Cuando veo el estado de la "Diners"
      Entonces la fecha límite de pago es el 18/10/2026, en 19 días

  Regla: Lo que debo es la deuda total, y nunca se convierte moneda

    Escenario: Compras de varios ciclos, un pago y una compra borrada
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "S/ 1,000.00" con la "Visa" el 10/09/2026
      Y que compré "S/ 200.00" con la "Visa" el 22/09/2026
      Y que compré y borré "S/ 999.00" con la "Visa" el 15/09/2026
      Y que pagué "S/ 300.00" a la "Visa" desde "Sueldo BCP" el 25/09/2026
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 900.00"
      Y el consumo del ciclo es "S/ 200.00"

    Escenario: Un pago en dólares desde una cuenta en soles baja lo que llegó
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "US$ 50.00" con la "Visa" el 10/09/2026
      Y que pagué "US$ 50.00" a la "Visa" con "S/ 185.00" desde "Sueldo BCP" el 25/09/2026
      Cuando veo el estado de la "Visa"
      Entonces debo "US$ 0.00"
      Y debo "S/ 0.00"

    Escenario: Una devolución baja la deuda y sacar efectivo la sube
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "S/ 300.00" con la "Visa" el 10/09/2026
      Y que me devolvieron "S/ 100.00" a la "Visa" el 12/09/2026
      Y que saqué "S/ 50.00" de la "Visa" a "Sueldo BCP" el 23/09/2026
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 250.00"

    Escenario: El saldo inicial cuenta, y lo anterior a su fecha no
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "S/ 999.00" con la "Visa" el 01/09/2026
      Y que la "Visa" ya debía "S/ 700.00" el 01/09/2026
      Y que compré "S/ 100.00" con la "Visa" el 02/09/2026
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 800.00"

  Regla: La utilización se mide con la deuda en la moneda de la línea

    Escenario: Alerta por utilización alta
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "S/ 1,800.00" con la "Visa" el 10/09/2026
      Cuando veo el estado de la "Visa"
      Entonces uso el 36.00 % de la línea
      Y el uso de la línea es alto

    Esquema del escenario: Los umbrales exactos
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "<compra>" con la "Visa" el 10/09/2026
      Cuando veo el estado de la "Visa"
      Entonces uso el <uso> % de la línea
      Y el uso de la línea es <nivel>

      Ejemplos:
        | compra      | uso   | nivel   |
        | S/ 1,500.00 | 30.00 | normal  |
        | S/ 1,500.01 | 30.00 | alto    |
        | S/ 3,499.99 | 70.00 | alto    |
        | S/ 3,500.00 | 70.00 | crítico |

    Escenario: Lo que debo en dólares no cuenta en una línea en soles
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "US$ 2,000.00" con la "Visa" el 10/09/2026
      Cuando veo el estado de la "Visa"
      Entonces uso el 0.00 % de la línea
      Y debo "US$ 2,000.00"

    Escenario: Sin línea propia no hay porcentaje
      Dado que tengo la tarjeta "Adicional" con una línea de "S/ 0.00", corte el día 20 y pago 25 días después del corte
      Y que hoy es 29/09/2026 en Lima
      Y que compré "S/ 100.00" con la "Adicional" el 10/09/2026
      Cuando veo el estado de la "Adicional"
      Entonces no hay porcentaje de uso de la línea

  Regla: Se avisa del pago mientras falte pagar el último estado de cuenta

    Esquema del escenario: El aviso según los días que faltan
      Dado que compré "S/ 100.00" con la "Visa" el 10/09/2026
      Y que hoy es <hoy> en Lima
      Cuando veo el estado de la "Visa"
      Entonces el aviso de pago es "<aviso>"

      Ejemplos:
        | hoy        | aviso             |
        | 11/10/2026 | ninguno           |
        | 12/10/2026 | vence en 3 días   |
        | 15/10/2026 | vence hoy         |
        | 16/10/2026 | venció hace 1 día |

    Escenario: Pagado el estado, ya no se avisa
      Dado que hoy es 14/10/2026 en Lima
      Y que compré "S/ 100.00" con la "Visa" el 10/09/2026
      Y que pagué "S/ 100.00" a la "Visa" desde "Sueldo BCP" el 01/10/2026
      Cuando veo el estado de la "Visa"
      Entonces el último estado de cuenta está pagado
      Y el aviso de pago es "ninguno"

  Regla: Las cuotas suman exactamente el total y se facturan una por estado de cuenta

    Escenario: Los céntimos que sobran van a las primeras cuotas
      Dado que hoy es 25/09/2026 en Lima
      Cuando compro "S/ 100.00" con la "Visa" el 10/09/2026 en 3 cuotas
      Entonces las cuotas son:
        | cuota | monto    | estado de cuenta |
        | 1     | S/ 33.34 | 20/09/2026       |
        | 2     | S/ 33.33 | 20/10/2026       |
        | 3     | S/ 33.33 | 20/11/2026       |

    Escenario: Las pendientes se cuentan solas por fecha
      Dado que compré "S/ 100.00" con la "Visa" el 10/09/2026 en 3 cuotas
      Y que hoy es 25/10/2026 en Lima
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 100.00"
      Y el último estado de cuenta es de "S/ 66.67"
      Y faltan facturar "S/ 33.33" en cuotas

    Escenario: Los intereses del banco son deuda de la tarjeta
      Dado que hoy es 29/09/2026 en Lima
      Y que compré "S/ 1,200.00" con la "Visa" el 10/09/2026 en 3 cuotas con un total de "S/ 1,260.00"
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 1,260.00"
      Y el último estado de cuenta es de "S/ 420.00"

  Regla: Cada quien ve solo lo suyo

    Escenario: La tarjeta de otra cuenta no existe para mí
      Dado que Bruno tiene su tarjeta "Visa" configurada
      Cuando intento ver el estado de la tarjeta de Bruno
      Entonces no se encuentra la tarjeta

    Escenario: No puedo configurar el método de pago de otra cuenta
      Dado que Bruno tiene su tarjeta "Mastercard" sin configurar
      Cuando intento configurar la "Mastercard" de Bruno
      Entonces no se encuentra el método de pago

    Escenario: Lo que otra cuenta compra con una tarjeta del mismo nombre no me suma
      Dado que hoy es 29/09/2026 en Lima
      Y que Bruno tiene su tarjeta "Visa" configurada
      Y que Bruno compró "S/ 500.00" con su "Visa" el 10/09/2026
      Cuando veo el estado de la "Visa"
      Entonces debo "S/ 0.00"
