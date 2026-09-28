# language: es
Característica: Etiquetas
  Para mirar mis gastos desde otro ángulo que la categoría
  Como dueño de mis finanzas
  Quiero marcar mis transacciones con etiquetas como "almuerzo" o "viaje-cusco"

  # Decidido con el autor el 2026-09-28 (ver docs/modules/transactions.md).

  Regla: Una etiqueta se crea al escribirla y no importan mayúsculas ni tildes

    Escenario: Registro un gasto con etiquetas nuevas
      Cuando registro un almuerzo con las etiquetas "almuerzo" y "oficina"
      Entonces queda con esas dos etiquetas

    Escenario: La misma etiqueta escrita distinto es una sola
      Dado que ya tengo la etiqueta "Almuerzo"
      Cuando registro otro gasto con la etiqueta "almuerzó"
      Entonces queda con la etiqueta "Almuerzo"
      Y sigo teniendo una sola etiqueta

    Escenario: Más de diez etiquetas es ruido
      Cuando intento registrar un gasto con once etiquetas distintas
      Entonces se rechaza

  Regla: Las etiquetas se corrigen como una lista completa

    Escenario: Cambio las etiquetas de un gasto
      Dado que registré un gasto con las etiquetas "almuerzo" y "oficina"
      Cuando lo corrijo con la etiqueta "cena"
      Entonces queda solo con la etiqueta "cena"

    Escenario: Quito todas las etiquetas
      Dado que registré un gasto con la etiqueta "almuerzo"
      Cuando lo corrijo sin etiquetas
      Entonces queda sin etiquetas

  Regla: Filtrar por una etiqueta suma solo lo etiquetado

    Escenario: Cuánto gasté en almuerzos
      Dado que gasté "S/ 10.00" y "S/ 4.50" con la etiqueta "almuerzo"
      Y "S/ 30.00" con la etiqueta "cena"
      Cuando filtro por la etiqueta "almuerzo"
      Entonces el gasto es "S/ 14.50"

    Escenario: Mis etiquetas son solo mías
      Dado que Bruno tiene gastos con la etiqueta "almuerzo"
      Cuando filtro mis transacciones por "almuerzo"
      Entonces no veo los gastos de Bruno
