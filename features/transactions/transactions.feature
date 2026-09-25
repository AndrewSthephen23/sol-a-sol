# language: es
Característica: Transacciones
  Para saber en qué se va mi plata
  Como dueño de mis finanzas
  Quiero registrar cada ingreso, gasto, ahorro, inversión y pago de deuda

  # Reglas decididas con el autor el 2026-09-24 y el 2026-09-25 (ver docs/modules/transactions.md).
  # La edición, el borrado y el listado se detallan con su tarea.

  Regla: El monto siempre es positivo; el signo lo da el tipo

    Escenario: Un gasto se registra con su monto en positivo
      Cuando registro un gasto variable de "S/ 25.90"
      Entonces queda guardado por "S/ 25.90"
      Y resta "S/ 25.90" al saldo del mes

    Escenario: Un monto cero o negativo se rechaza
      Cuando intento registrar un gasto de "S/ -25.90"
      Entonces se rechaza porque el monto debe ser mayor que cero

    Escenario: El ahorro también sale de lo disponible
      Cuando registro un ahorro de "S/ 500.00"
      Entonces resta "S/ 500.00" al saldo del mes
      Y suma "S/ 500.00" al ahorro del mes

  Regla: Gasto es fijo más variable; ahorro es ahorro más inversión

    Escenario: El pago de una deuda no es gasto
      Dado que pagué "S/ 300.00" de un préstamo
      Cuando veo el gasto del mes
      Entonces ese pago no está incluido
      Pero sí resta del saldo del mes

    Escenario: La inversión cuenta para la tasa de ahorro
      Dado que en el mes tuve ingresos por "S/ 4,000.00"
      Y ahorré "S/ 400.00" e invertí "S/ 200.00"
      Cuando veo la tasa de ahorro del mes
      Entonces es 15.00 %

  Regla: Solo se registra lo que ya pasó

    Escenario: Una fecha futura se rechaza
      Dado que hoy es 24/09/2026 en Lima
      Cuando intento registrar un gasto con fecha 25/09/2026
      Entonces se rechaza porque la fecha es futura

    Escenario: Lo de hoy se acepta aunque en UTC ya sea mañana
      Dado que son las 21:30 del 24/09/2026 en Lima
      Cuando registro un gasto con fecha 24/09/2026
      Entonces queda guardado

  Regla: La moneda nunca se supone ni se convierte

    Escenario: Sin moneda, se usa la del método de pago
      Dado que tengo la cuenta "Sueldo BCP" en soles
      Cuando registro un gasto con esa cuenta sin indicar moneda
      Entonces queda en soles

    Escenario: Con una tarjeta bimoneda, la moneda es obligatoria
      Dado que tengo la tarjeta bimoneda "Visa Interbank"
      Cuando intento registrar un gasto con esa tarjeta sin indicar moneda
      Entonces se rechaza pidiendo la moneda

  Regla: La categoría coincide con el tipo y está activa

    Escenario: Un ingreso no va en una categoría de gastos
      Dado que tengo la categoría de gasto variable "Comida"
      Cuando intento registrar un ingreso en "Comida"
      Entonces se rechaza

    Escenario: Una categoría archivada no se usa en transacciones nuevas
      Dado que archivé la categoría "Netflix"
      Cuando intento registrar un gasto en "Netflix"
      Entonces se rechaza
      Pero mis gastos viejos siguen en "Netflix"

    Escenario: La subcategoría es opcional
      Dado que tengo la categoría "Comida" con la subcategoría "Delivery"
      Cuando registro un gasto en "Comida"
      Entonces queda guardado en "Comida"

  Regla: El método de pago es opcional, pero si se indica debe estar activo

    Escenario: Un gasto sin método de pago
      Cuando registro un gasto de "S/ 12.00" sin indicar con qué pagué
      Entonces queda guardado sin método de pago

    Escenario: Una tarjeta archivada no se usa en transacciones nuevas
      Dado que archivé la tarjeta "Visa vieja"
      Cuando intento registrar un gasto con "Visa vieja"
      Entonces se rechaza porque el método de pago está archivado

  Regla: El monto se guarda exacto, sin redondear

    Escenario: Los céntimos llegan intactos a la base
      Cuando registro un gasto de "S/ 1,234,567,890,123.45"
      Entonces queda guardado por "S/ 1,234,567,890,123.45"

    Escenario: Un tercer decimal se rechaza en vez de redondearse
      Cuando intento registrar un gasto de "S/ 25.905"
      Entonces se rechaza porque el monto tiene más de dos decimales

  Regla: Cada quien ve solo lo suyo

    Escenario: No puedo usar la categoría de otra persona
      Dado que Bruno tiene la categoría "Almuerzos"
      Cuando intento registrar un gasto en la categoría de Bruno
      Entonces la categoría no se encuentra

    Escenario: No puedo ver la transacción de otra persona
      Dado que Bruno registró un gasto
      Cuando intento verlo
      Entonces la transacción no se encuentra

    Escenario: Lo registrado desde la web queda como manual
      Cuando registro un gasto desde la web
      Entonces su origen es "MANUAL"

  Regla: Todo se puede corregir, también en meses pasados, menos el origen

    Escenario: Corrijo el monto de un gasto del mes pasado
      Dado que registré un gasto de "S/ 25.90" en agosto
      Cuando corrijo el monto a "S/ 29.50"
      Entonces queda guardado por "S/ 29.50"

    Escenario: El tipo cambia junto con su categoría
      Dado que registré un gasto variable en "Comida"
      Cuando lo cambio a gasto fijo en "Alquiler"
      Entonces queda como gasto fijo en "Alquiler"

    Escenario: El tipo no cambia solo
      Dado que registré un gasto variable en "Comida"
      Cuando intento cambiarlo a gasto fijo sin cambiar la categoría
      Entonces se rechaza porque la categoría es de otro tipo

    Escenario: La moneda no cambia sin que la diga
      Dado que registré un gasto de "S/ 25.90" con la cuenta "Sueldo BCP"
      Cuando cambio el método de pago a la cuenta "Ahorros USD"
      Entonces el gasto sigue en soles

    Escenario: Una transacción importada sigue diciendo que vino del CSV
      Dado que importé un gasto desde el CSV
      Cuando corrijo su descripción
      Entonces su origen sigue siendo "IMPORT"

    Escenario: Una categoría archivada después no impide corregir
      Dado que registré un gasto en "Netflix"
      Y después archivé la categoría "Netflix"
      Cuando corrijo su monto
      Entonces queda guardado en "Netflix"

  Regla: Borrar se puede deshacer

    Escenario: Una transacción borrada deja de aparecer
      Dado que registré un gasto
      Cuando lo borro
      Entonces ya no aparece
      Pero sigue guardado para la auditoría

    Escenario: Deshago el borrado
      Dado que borré un gasto
      Cuando deshago el borrado
      Entonces vuelve a aparecer tal como estaba

    Escenario: Deshacer dos veces no cuenta dos veces
      Dado que borré un gasto y deshice el borrado
      Cuando vuelvo a deshacer el borrado
      Entonces el gasto sigue apareciendo una sola vez

    Escenario: No puedo borrar lo de otra persona
      Dado que Bruno registró un gasto
      Cuando intento borrarlo
      Entonces la transacción no se encuentra
      Y Bruno la sigue viendo
