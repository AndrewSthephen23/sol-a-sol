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

    Escenario: Un número largo se rechaza, no se recorta
      Cuando intento registrar una tarjeta terminada en "1234567890"
      Entonces se rechaza porque los últimos dígitos deben ser exactamente 4
      Y no queda guardado ningún dígito de ese número

    Escenario: No hay dónde mandar el CVV
      Cuando intento registrar una tarjeta con su CVV
      Entonces se rechaza sin guardar nada

  Regla: Cada tipo de método de pago tiene sus datos

    Escenario: Una tarjeta de crédito necesita sus últimos 4 dígitos
      Cuando intento registrar la tarjeta de crédito "Visa BCP" sin sus últimos 4 dígitos
      Entonces se rechaza

    Escenario: Una billetera no tiene últimos 4 dígitos
      Cuando intento registrar la billetera "Yape" terminada en "4242"
      Entonces se rechaza

    Escenario: Una cuenta necesita moneda
      Cuando intento registrar la cuenta "Sueldo BCP" sin moneda
      Entonces se rechaza porque una cuenta guarda una sola moneda

    Escenario: Una tarjeta bimoneda no tiene moneda propia
      Cuando registro la tarjeta de crédito "Visa Interbank" terminada en "0931" sin moneda
      Entonces queda guardada aceptando soles y dólares

    Escenario: El efectivo no tiene banco
      Cuando intento registrar "Efectivo" con el banco "BCP"
      Entonces se rechaza

  Regla: No hay dos métodos de pago con el mismo alias

    Escenario: El alias no distingue mayúsculas
      Dado que tengo la tarjeta "Visa BCP"
      Cuando intento registrar otro método llamado "visa bcp"
      Entonces se rechaza porque el alias ya existe

    Escenario: Para reusar el alias de uno archivado, se restaura
      Dado que tengo la tarjeta "Visa BCP" archivada
      Cuando intento registrar otro método llamado "Visa BCP"
      Entonces se rechaza y se sugiere restaurar la archivada

  Regla: Un método de pago se archiva, no se borra

    Escenario: Archivar lo saca de los métodos para registrar
      Dado que tengo la tarjeta "Visa BCP"
      Cuando la archivo
      Entonces ya no aparece en mi lista de métodos
      Y aparece si pido ver también los archivados

    Escenario: El tipo no se cambia
      Dado que tengo la tarjeta "Visa BCP"
      Cuando intento convertirla en efectivo
      Entonces se rechaza

  Regla: Los métodos de pago de cada persona son solo suyos

    Escenario: No veo ni toco los métodos de otra persona
      Dado que Bruno tiene la tarjeta "Visa BCP"
      Cuando intento archivarla desde mi cuenta
      Entonces la respuesta es que no existe
      Y su tarjeta sigue intacta
