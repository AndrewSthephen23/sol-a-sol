# language: es
Característica: Presupuesto
  Para gastar con un plan
  Como dueño de mis finanzas
  Quiero decir cuánto espero gastar o recibir en cada categoría del mes, y ver cómo voy

  # Reglas decididas con el autor el 2026-09-29 (ver docs/modules/budgeting.md).
  # Lo real sale de las transacciones registradas, como en la aplicación.

  Regla: Un límite se excede apenas lo real pasa lo planeado

    Escenario: Lo disponible es lo planeado menos lo gastado
      Dado que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 450.00" en "Comida" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está dentro del límite y quedan "S/ 50.00"
      Y el ejecutado de "Comida" es 90.00 %

    Escenario: Gastar justo lo planeado no es pasarse
      Dado que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 500.00" en "Comida" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está dentro del límite y quedan "S/ 0.00"

    Escenario: Un céntimo más ya es pasarse
      Dado que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 500.01" en "Comida" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está excedida por "S/ 0.01"

  Regla: Una meta se cumple al llegar a lo planeado

    Escenario: Un ingreso que no llega está pendiente
      Dado que presupuesté "S/ 4,000.00" para "Sueldo" en septiembre de 2026
      Y recibí "S/ 3,000.00" en "Sueldo" el 15/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces a "Sueldo" le faltan "S/ 1,000.00"

    Escenario: Recibir lo planeado cumple la meta
      Dado que presupuesté "S/ 4,000.00" para "Sueldo" en septiembre de 2026
      Y recibí "S/ 4,000.00" en "Sueldo" el 15/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Sueldo" está cumplida

    Escenario: Ahorrar más de lo planeado también cumple la meta
      Dado que presupuesté "S/ 300.00" para "Ahorro" en septiembre de 2026
      Y ahorré "S/ 350.00" en "Ahorro" el 15/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Ahorro" está cumplida

  Regla: Una partida en cero no tiene porcentaje

    Escenario: Lo gastado en una partida en cero la excede, sin porcentaje
      Dado que presupuesté "S/ 0.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 20.00" en "Comida" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está excedida por "S/ 20.00"
      Y "Comida" no tiene porcentaje ejecutado

  Regla: Las monedas no se mezclan ni se convierten

    Escenario: Lo gastado en dólares no consume la partida en soles
      Dado que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "US$ 20.00" en "Comida" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está dentro del límite y quedan "S/ 500.00"
      Y lo gastado sin presupuesto en dólares es "US$ 20.00"

  Regla: La partida va en la categoría madre y suma lo de sus hijas

    Escenario: Lo gastado en una subcategoría cuenta en su madre
      Dado que tengo la categoría "Comida" con la subcategoría "Mercado"
      Y que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 120.00" en "Mercado" el 10/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está dentro del límite y quedan "S/ 380.00"

    Escenario: Una subcategoría no lleva partida propia
      Dado que tengo la categoría "Comida" con la subcategoría "Mercado"
      Cuando intento presupuestar "S/ 100.00" para "Mercado" en septiembre de 2026
      Entonces se rechaza porque la partida va en la categoría madre

  Regla: Lo gastado sin partida no desaparece

    Escenario: Lo que no tiene partida suma aparte y cuenta en el total del tipo
      Dado que tengo la categoría de gasto variable "Transporte"
      Y que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Y gasté "S/ 30.00" en "Comida" el 10/09/2026
      Y gasté "S/ 45.00" en "Transporte" el 11/09/2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces lo gastado sin presupuesto en soles es "S/ 45.00"
      Y el gasto variable en soles suma "S/ 75.00" de "S/ 500.00"

  Regla: Cualquier mes se puede presupuestar, pasado o futuro

    Esquema del escenario: Presupuestar <mes>
      Cuando presupuesto "S/ 800.00" para "Comida" en <mes>
      Entonces el presupuesto de <mes> queda así:
        | categoría | planeado  |
        | Comida    | S/ 800.00 |

      Ejemplos:
        | mes                |
        | enero de 2025      |
        | septiembre de 2026 |
        | diciembre de 2027  |

    Escenario: Un monto negativo se rechaza
      Cuando intento presupuestar "S/ -100.00" para "Comida" en septiembre de 2026
      Entonces se rechaza porque el monto planeado no puede ser negativo

  Regla: Copiar del mes anterior solo completa lo que falta

    Escenario: Copiar a un mes vacío
      Dado que presupuesté "S/ 800.00" para "Comida" en agosto de 2026
      Y que presupuesté "S/ 1,500.00" para "Alquiler" en agosto de 2026
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces se copió de agosto de 2026
      Y el presupuesto de septiembre de 2026 queda así:
        | categoría | planeado    |
        | Comida    | S/ 800.00   |
        | Alquiler  | S/ 1,500.00 |

    Escenario: Una partida que el mes ya tiene no se pisa
      Dado que presupuesté "S/ 800.00" para "Comida" en agosto de 2026
      Y que presupuesté "S/ 900.00" para "Comida" en septiembre de 2026
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces el presupuesto de septiembre de 2026 queda así:
        | categoría | planeado  |
        | Comida    | S/ 900.00 |

    Escenario: Si el mes anterior está vacío, se copia del último con presupuesto
      Dado que presupuesté "S/ 600.00" para "Comida" en junio de 2026
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces se copió de junio de 2026

    Escenario: Una categoría archivada no se copia, y se avisa
      Dado que tengo la categoría de gasto variable "Cine"
      Y que presupuesté "S/ 800.00" para "Comida" en agosto de 2026
      Y que presupuesté "S/ 60.00" para "Cine" en agosto de 2026
      Y después archivé la categoría "Cine"
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces el presupuesto de septiembre de 2026 queda así:
        | categoría | planeado  |
        | Comida    | S/ 800.00 |
      Y se avisa que "Cine" no se copió

    Escenario: Sin ningún mes anterior con presupuesto no se copia nada, y no es un error
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces no se copió de ningún mes
      Y el presupuesto de septiembre de 2026 está vacío

  Regla: Al fusionar categorías, sus partidas se suman

    Escenario: Las dos partidas del mes quedan en una
      Dado que tengo la categoría de gasto variable "Supermercado"
      Y que presupuesté "S/ 800.00" para "Comida" en septiembre de 2026
      Y que presupuesté "S/ 300.50" para "Supermercado" en septiembre de 2026
      Cuando fusiono "Supermercado" en "Comida"
      Entonces el presupuesto de septiembre de 2026 queda así:
        | categoría | planeado    |
        | Comida    | S/ 1,100.50 |

  Regla: Cada quien ve solo lo suyo

    Escenario: No se puede presupuestar la categoría de otra cuenta
      Dado que Bruno tiene la categoría "Almuerzos"
      Cuando intento presupuestar "S/ 100.00" para la categoría de Bruno en septiembre de 2026
      Entonces la categoría no se encuentra

    Escenario: Lo que gasta otra cuenta no consume mi presupuesto
      Dado que Bruno registró gastos en su categoría "Comida"
      Y que presupuesté "S/ 500.00" para "Comida" en septiembre de 2026
      Cuando veo el presupuesto de septiembre de 2026
      Entonces "Comida" está dentro del límite y quedan "S/ 500.00"

    Escenario: No se copia el presupuesto de otra cuenta
      Dado que Bruno presupuestó "S/ 900.00" para su categoría "Almuerzos" en agosto de 2026
      Cuando copio el presupuesto anterior a septiembre de 2026
      Entonces no se copió de ningún mes
