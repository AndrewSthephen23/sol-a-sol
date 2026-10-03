# language: es
Característica: Metas de ahorro
  Para ahorrar para algo concreto y llegar a tiempo
  Como dueño de mis finanzas
  Quiero saber cuánto llevo, cuánto me falta, cuánto aportar al mes y si voy a llegar

  # Reglas decididas con el autor el 2026-10-03 (ver docs/modules/goals.md).
  # Lo que vive en Prisma (claves compuestas, nombre único en la base, otra cuenta) lo cubren
  # las pruebas de integración de apps/api/test/goals/ y apps/api/test/prisma/goals-tables.spec.ts.

  Antecedentes:
    Dado que hoy es 03/10/2026 en Lima
    Y que tengo la meta "Viaje" de "S/ 1,200.00" del 01/01/2026 al 31/12/2026

  Regla: Lo ahorrado son los aportes menos los retiros, y lo que falta nunca es negativo

    Escenario: Aportes y un retiro
      Dado que aporté "S/ 400.00" a "Viaje" el 10/02/2026
      Y que retiré "S/ 100.00" de "Viaje" el 15/03/2026
      Cuando veo la meta "Viaje"
      Entonces llevo "S/ 300.00" de la meta, el 25.00 %
      Y me faltan "S/ 900.00"

    Escenario: Pasarse de la meta se muestra tal cual
      Dado que aporté "S/ 1,500.00" a "Viaje" el 10/09/2026
      Cuando veo la meta "Viaje"
      Entonces llevo "S/ 1,500.00" de la meta, el 125.00 %
      Y me faltan "S/ 0.00"
      Y me pasé por "S/ 300.00"
      Y la meta está cumplida

    Escenario: Un aporte anterior al inicio también cuenta
      Dado que aporté "S/ 100.00" a "Viaje" el 20/12/2025
      Cuando veo la meta "Viaje"
      Entonces llevo "S/ 100.00" de la meta, el 8.33 %

  Regla: El aporte mensual sugerido cuenta el mes en curso y redondea hacia arriba al céntimo

    Escenario: Lo que falta entre octubre, noviembre y diciembre
      Dado que aporté "S/ 200.00" a "Viaje" el 10/02/2026
      Cuando veo la meta "Viaje"
      Entonces el aporte mensual sugerido es "S/ 333.34"

    Escenario: Una meta que todavía no empieza cuenta desde su mes de inicio
      Dado que tengo la meta "Laptop" de "S/ 400.00" del 15/11/2026 al 14/02/2027
      Cuando veo la meta "Laptop"
      Entonces el aporte mensual sugerido es "S/ 100.00"
      Y la meta está en curso

    Escenario: Con la fecha final pasada no hay aporte sugerido
      Dado que tengo la meta "Bicicleta" de "S/ 500.00" del 01/01/2026 al 31/08/2026
      Y que aporté "S/ 100.00" a "Bicicleta" el 10/02/2026
      Cuando veo la meta "Bicicleta"
      Entonces no hay aporte mensual sugerido
      Y la meta está vencida

  Regla: En riesgo, más de 10 puntos por debajo de lo esperado al cierre del mes anterior

    Esquema del escenario: Justo en el límite y un céntimo más atrás
      Dado que hoy es 15/03/2026 en Lima
      Y que tengo la meta "Fondo" de "S/ 1,000.00" del 01/01/2026 al 10/04/2026
      Y que aporté "<aporte>" a "Fondo" el 25/02/2026
      Cuando veo la meta "Fondo"
      Entonces se esperaba el 59.00 %
      Y la meta está <estado>

      Ejemplos:
        | aporte   | estado   |
        | S/ 490.00 | en curso |
        | S/ 489.99 | en riesgo |

    Escenario: En el primer mes no se espera nada
      Dado que hoy es 31/01/2026 en Lima
      Cuando veo la meta "Viaje"
      Entonces se esperaba el 0.00 %
      Y la meta está en curso

    Escenario: Una meta cumplida sigue cumplida después de su fecha final
      Dado que tengo la meta "Bicicleta" de "S/ 500.00" del 01/01/2026 al 31/08/2026
      Y que aporté "S/ 500.00" a "Bicicleta" el 10/08/2026
      Cuando veo la meta "Bicicleta"
      Entonces la meta está cumplida

  Regla: Un aporte enlazado toma la transacción entera y la sigue

    Escenario: Corregir o borrar la transacción cambia la meta
      Dado que ahorré "S/ 500.00" en "Ahorro" el 10/09/2026
      Y que enlacé ese ahorro a "Viaje"
      Cuando corrijo ese ahorro a "S/ 650.00"
      Entonces "Viaje" lleva "S/ 650.00"
      Cuando borro ese ahorro
      Entonces "Viaje" lleva "S/ 0.00"

    Escenario: Una inversión también se enlaza
      Dado que ahorré "S/ 250.00" en "Inversiones" el 10/09/2026
      Y que enlacé ese ahorro a "Viaje"
      Entonces "Viaje" lleva "S/ 250.00"

    Escenario: Un gasto no se enlaza
      Dado que gasté "S/ 80.00" en "Comida" el 10/09/2026
      Cuando intento enlazar ese gasto a "Viaje"
      Entonces se rechaza con "GOAL_TRANSACTION_NOT_A_SAVING"

    Escenario: Una transacción aporta a una sola meta
      Dado que tengo la meta "Laptop" de "S/ 3,000.00" del 01/01/2026 al 31/12/2026
      Y que ahorré "S/ 500.00" en "Ahorro" el 10/09/2026
      Y que enlacé ese ahorro a "Viaje"
      Cuando intento enlazar ese ahorro a "Laptop"
      Entonces se rechaza con "GOAL_TRANSACTION_ALREADY_LINKED"

  Regla: Una meta tiene una sola moneda y nunca se convierte

    Escenario: Un ahorro en dólares no se enlaza a una meta en soles
      Dado que ahorré "US$ 100.00" en "Ahorro" el 10/09/2026
      Cuando intento enlazar ese ahorro a "Viaje"
      Entonces se rechaza con "GOAL_CURRENCY_MISMATCH"

  Regla: Lo que se aporta tiene que tener sentido

    Escenario: Un retiro no saca más de lo ahorrado
      Dado que aporté "S/ 300.00" a "Viaje" el 10/09/2026
      Cuando intento retirar "S/ 300.01" de "Viaje" el 20/09/2026
      Entonces se rechaza con "GOAL_WITHDRAWAL_EXCEEDS_SAVED"

    Escenario: Deshacer un aporte que un retiro ya sacó tampoco
      Dado que aporté "S/ 300.00" a "Viaje" el 10/09/2026
      Y que aporté "S/ 100.00" a "Viaje" el 11/09/2026
      Y que retiré "S/ 200.00" de "Viaje" el 20/09/2026
      Cuando intento deshacer el aporte de "S/ 300.00" a "Viaje"
      Entonces se rechaza con "GOAL_WITHDRAWAL_EXCEEDS_SAVED"

    Escenario: Un aporte con fecha futura se rechaza
      Cuando intento aportar "S/ 10.00" a "Viaje" el 04/10/2026
      Entonces se rechaza con "GOAL_CONTRIBUTION_DATE_IN_FUTURE"

    Escenario: Una meta archivada no recibe aportes
      Dado que archivé la meta "Viaje"
      Cuando intento aportar "S/ 10.00" a "Viaje" el 01/10/2026
      Entonces se rechaza con "GOAL_ARCHIVED"

    Escenario: Una meta termina después de empezar
      Cuando intento crear la meta "Casa" de "S/ 50,000.00" del 01/01/2027 al 01/01/2027
      Entonces se rechaza con "GOAL_END_NOT_AFTER_START"

    Escenario: El nombre no se repite, sin importar mayúsculas
      Cuando intento crear la meta "VIAJE" de "S/ 100.00" del 01/01/2026 al 31/12/2026
      Entonces se rechaza con "GOAL_NAME_TAKEN"

  Regla: Cada quien ve solo lo suyo

    Escenario: La meta de otra cuenta no se ve ni recibe aportes
      Dado que Bruno tiene la meta "Viaje" de "S/ 9,999.00" del 01/01/2026 al 31/12/2026
      Cuando veo mis metas
      Entonces veo solo la meta "Viaje" de "S/ 1,200.00"
      Cuando intento aportar "S/ 10.00" a la meta de Bruno
      Entonces se rechaza con "GOAL_NOT_FOUND"
