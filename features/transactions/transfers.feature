# language: es
Característica: Transferencias entre mis cuentas
  Para saber dónde está mi plata sin inflar mis ingresos ni mis gastos
  Como dueño de mis finanzas
  Quiero registrar la plata que paso de una cuenta mía a otra

  # Decidido con el autor el 2026-09-27 (ver docs/modules/transactions.md).

  Regla: Una transferencia no es ingreso ni gasto

    Escenario: Paso plata del banco a Yape
      Dado que tengo las cuentas "BCP Digital Soles" y "BCP Yape Soles" en soles
      Cuando transfiero "S/ 50.00" de "BCP Digital Soles" a "BCP Yape Soles"
      Entonces queda registrada la transferencia
      Y mis ingresos y gastos del mes no cambian

    Escenario: No se transfiere a la misma cuenta
      Cuando intento transferir de "BCP Yape Soles" a "BCP Yape Soles"
      Entonces se rechaza porque origen y destino son la misma cuenta

  Regla: Al cambiar de moneda se guardan los dos montos, nunca se convierte

    Escenario: Cambio soles a dólares para pagar una suscripción
      Dado que tengo "Interbank Simple Soles" en soles e "Interbank Simple Dólares" en dólares
      Cuando transfiero "S/ 37.50" y recibo "US$ 10.00"
      Entonces salen "S/ 37.50" de "Interbank Simple Soles"
      Y llegan "US$ 10.00" a "Interbank Simple Dólares"

    Escenario: Sin el monto recibido no hay cambio de moneda
      Cuando transfiero "S/ 37.50" de "Interbank Simple Soles" a "Interbank Simple Dólares" sin decir cuánto recibo
      Entonces se rechaza pidiendo el monto recibido

    Escenario: En la misma moneda llega lo mismo que salió
      Cuando transfiero "S/ 50.00" a Yape diciendo que recibo "S/ 49.00"
      Entonces se rechaza porque los montos no coinciden

    Escenario: Cada cuenta maneja su moneda
      Cuando intento transferir dólares desde "BCP Digital Soles"
      Entonces se rechaza porque la cuenta es en soles

  Regla: Pagar la tarjeta de crédito es una transferencia

    Escenario: El gasto se cuenta al comprar, no al pagar la tarjeta
      Dado que compré un almuerzo de "S/ 30.00" con mi tarjeta de crédito
      Cuando pago la tarjeta desde "BCP Digital Soles"
      Entonces el pago es una transferencia de la cuenta a la tarjeta
      Y mis gastos del mes siguen siendo "S/ 30.00"

  Regla: Solo entre mis cuentas activas

    Escenario: No puedo usar la cuenta de otra persona
      Cuando intento transferir a una cuenta de Bruno
      Entonces la cuenta no se encuentra

    Escenario: Una cuenta archivada no se usa en transferencias nuevas
      Dado que archivé "Lemon"
      Cuando intento transferir a "Lemon"
      Entonces se rechaza porque la cuenta está archivada
