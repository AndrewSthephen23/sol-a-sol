# language: es
Característica: Catálogo
  Para saber en qué se va mi plata y con qué la pago
  Como dueño de mis finanzas
  Quiero ordenar mis movimientos en categorías y métodos de pago propios

  # Reglas decididas con el autor el 2026-09-23 (ver docs/modules/catalog.md).
  # Los escenarios de cada regla se detallan en la tarea de H3 que la implementa.

  Regla: Las categorías tienen un solo nivel de subcategorías

    Escenario: Una subcategoría cuelga de una categoría del mismo tipo
      Dado que tengo la categoría de gasto variable "Comida"
      Cuando creo la subcategoría "Restaurantes" dentro de "Comida"
      Entonces "Restaurantes" queda como subcategoría de "Comida"

    Escenario: Una subcategoría no puede tener hijas
      Dado que tengo la subcategoría "Restaurantes" dentro de "Comida"
      Cuando intento crear "Pollerías" dentro de "Restaurantes"
      Entonces se rechaza porque solo hay un nivel de subcategorías

    Escenario: La subcategoría es del mismo tipo que su categoría
      Dado que tengo la categoría de gasto fijo "Vivienda"
      Cuando intento crear una subcategoría de gasto variable dentro de "Vivienda"
      Entonces se rechaza

  Regla: No hay dos categorías hermanas con el mismo nombre en el mismo tipo

    Escenario: El nombre no distingue mayúsculas
      Dado que tengo la categoría de gasto variable "Comida"
      Cuando intento crear la categoría de gasto variable "comida"
      Entonces se rechaza porque ya existe

    Escenario: El mismo nombre puede existir en otro tipo
      Dado que tengo la categoría de gasto variable "Otros"
      Cuando creo la categoría de gasto fijo "Otros"
      Entonces quedan las dos

  Regla: Una categoría no se borra, se archiva

    Escenario: Archivar conserva el historial
      Dado que tengo la categoría "Netflix" con transacciones
      Cuando la archivo
      Entonces ya no aparece para registrar gastos nuevos
      Y sus transacciones siguen mostrando "Netflix"

    Escenario: Para volver a usar un nombre se restaura la archivada
      Dado que tengo la categoría "Netflix" archivada
      Cuando intento crear otra categoría "Netflix" del mismo tipo
      Entonces se rechaza y se sugiere restaurar la archivada

  Regla: De una tarjeta solo se guardan alias, banco y últimos 4 dígitos

    Escenario: Registrar una tarjeta
      Cuando registro la tarjeta de crédito "Visa BCP" del banco "BCP" terminada en "4242"
      Entonces queda guardada con esos tres datos y nada más

    Escenario: No se aceptan más de 4 dígitos
      Cuando intento registrar una tarjeta terminada en "12345"
      Entonces se rechaza

    Escenario: Una tarjeta bimoneda no tiene moneda propia
      Cuando registro la tarjeta de crédito "Visa Interbank" sin moneda
      Entonces acepta transacciones en soles y en dólares
