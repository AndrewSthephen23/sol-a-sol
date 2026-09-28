# language: es
Característica: Importar mis transacciones desde un CSV
  Para traer el historial que llevaba en mi hoja de cálculo
  Como dueño de mis finanzas
  Quiero importar un CSV revisando antes qué entra, sin duplicar nada

  # Decidido con el autor el 2026-09-28 (ver docs/modules/transactions-import-format.md).

  Regla: Antes de confirmar veo qué pasaría, sin que se guarde nada

    Escenario: La vista previa señala cada problema por línea
      Dado un CSV con una fila de tipo "Egreso" en la línea 8
      Cuando lo previsualizo
      Entonces veo el problema en la línea 8, columna "tipo"
      Y no se guardó ninguna transacción

    Escenario: La vista previa lista lo que falta en mi cuenta
      Dado un CSV que usa la subcategoría "Comida > Almuerzo" y el método "Yape", que no tengo
      Cuando lo previsualizo
      Entonces veo "Comida > Almuerzo" y "Yape" por resolver, con las líneas que los usan

  Regla: Entra todo o nada

    Escenario: Importo el archivo resolviendo lo que faltaba
      Dado un CSV sin problemas que usa "Comida > Almuerzo" y "Yape", que no tengo
      Cuando lo confirmo decidiendo crear la subcategoría y crear "Yape" como billetera en soles
      Entonces se guardan todas sus filas con origen "IMPORT"
      Y ahora tengo la subcategoría "Almuerzo" y el método "Yape"

    Escenario: Un archivo con un problema no guarda nada
      Dado un CSV con una fila con problema
      Cuando intento confirmarlo
      Entonces se rechaza y no se guarda ninguna fila, categoría ni método

    Escenario: No puedo confirmar sin decidir qué hacer con lo que falta
      Dado un CSV que usa el método "Yape", que no tengo
      Cuando intento confirmarlo sin decir qué hacer con "Yape"
      Entonces se rechaza pidiendo esa decisión

    Escenario: Uso uno que ya tengo en lugar de crear otro
      Dado un CSV que usa el método "Transferencia", que no tengo
      Cuando lo confirmo decidiendo usar "BCP Digital Soles" en su lugar
      Entonces esas filas quedan en "BCP Digital Soles"

    Escenario: Restauro lo que tenía archivado
      Dado que archivé la categoría "Netflix"
      Y un CSV que la usa
      Cuando lo confirmo decidiendo restaurarla
      Entonces "Netflix" vuelve a estar vigente y las filas quedan en ella

    Escenario: No puedo usar lo de otra cuenta
      Cuando intento confirmar decidiendo usar una categoría de otra persona
      Entonces se rechaza como una decisión que no corresponde

  Regla: Importar dos veces el mismo archivo no duplica

    Escenario: Vuelvo a importar el mismo archivo
      Dado que ya importé un CSV
      Cuando lo importo otra vez
      Entonces no entra ninguna fila nueva y todas aparecen como ya importadas

    Escenario: Dos importaciones a la vez
      Cuando mando el mismo CSV dos veces al mismo tiempo
      Entonces entra una sola vez y la otra se rechaza por conflicto

    Escenario: Dos filas idénticas del mismo día entran las dos
      Dado un CSV con dos pasajes iguales el mismo día
      Cuando lo importo
      Entonces se guardan los dos pasajes
