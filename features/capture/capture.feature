# language: es
Característica: Bandeja de capturas del teléfono
  Para registrar mis gastos sin abrir la web
  Como dueño de mis finanzas
  Quiero que lo que manda mi teléfono llegue a una bandeja que reviso, corrijo y confirmo

  # Reglas decididas con el autor el 2026-10-03 y el 2026-10-04 (ver docs/modules/capture.md).
  # Lo que vive en Prisma (claves compuestas, la clave de idempotencia única en la base, los CHECK,
  # dos confirmaciones a la vez) y lo que vive en HTTP (token personal, 422, tope de caudal) lo
  # cubren apps/api/test/capture/ y apps/api/test/prisma/capture-tables.spec.ts.
  #
  # Comprobado rompiendo cada regla (2026-10-04): 19 de 21 roturas ponen un escenario en rojo. Las
  # dos que no, no cambian ninguna conducta: sin buscar antes la clave de idempotencia, la clave
  # única del repositorio devuelve igual la captura original; y el resumen ya pide a `capture` solo
  # las capturas del mes (el filtro del dominio lo cubren sus pruebas, con mutación al 100 %).

  Antecedentes:
    Dado que hoy es 03/10/2026 en Lima

  Regla: Toda captura bien formada se guarda, aunque no se entienda

    Escenario: Una notificación que no se entiende llega igual a la bandeja
      Cuando llega de Android la notificación "Tienes una notificación nueva" a las 11:30 del 03/10/2026
      Entonces la bandeja tiene 1 captura
      Y la captura no tiene monto
      Y la captura avisa "AMOUNT_NOT_FOUND"

    Escenario: Lo que manda el atajo se entiende sin el banco
      Cuando llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Entonces la captura es de "S/ 25.90" en "Tambo" del 03/10/2026
      Y la captura no avisa nada

  Regla: Un reintento no duplica la captura

    Escenario: La misma clave de idempotencia devuelve la captura original
      Cuando llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026 con la clave "reintento-1"
      Y llega del iPhone un gasto de "S/ 99.00" en "Wong" a las 11:31 del 03/10/2026 con la clave "reintento-1"
      Entonces la bandeja tiene 1 captura
      Y la captura es de "S/ 25.90" en "Tambo" del 03/10/2026

    Escenario: Sin clave, el mismo pedido otra vez es la misma captura
      Cuando llega de Android la notificación "Compra por S/ 12.50" a las 11:30 del 03/10/2026
      Y llega de Android la notificación "Compra por S/ 12.50" a las 11:30 del 03/10/2026
      Entonces la bandeja tiene 1 captura

    Escenario: Dos notificaciones distintas del mismo instante son dos capturas
      Cuando llega de Android la notificación "Notificación uno" a las 11:30 del 03/10/2026
      Y llega de Android la notificación "Notificación dos" a las 11:30 del 03/10/2026
      Entonces la bandeja tiene 2 capturas

  Regla: La fecha es el día en Lima; un día futuro queda en hoy, con aviso

    Escenario: A las 21:30 de Lima sigue siendo el mismo día, aunque en UTC ya sea el siguiente
      Cuando llega del iPhone un gasto de "S/ 18.00" en "Tambo" a las 21:30 del 02/10/2026
      Entonces la captura es de "S/ 18.00" en "Tambo" del 02/10/2026

    Escenario: Un teléfono con la fecha adelantada
      Cuando llega del iPhone un gasto de "S/ 18.00" en "Tambo" a las 09:00 del 05/10/2026
      Entonces la captura es de "S/ 18.00" en "Tambo" del 03/10/2026
      Y la captura avisa "FUTURE_DATE"

  Regla: El mismo monto y comercio en ±2 minutos es un posible duplicado, que se puede confirmar igual

    Esquema del escenario: <diferencia> después
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Cuando llega del iPhone un gasto de "S/ 25.90" en "TAMBÓ" a las <hora> del 03/10/2026
      Entonces la captura <marca>

      Ejemplos:
        | diferencia   | hora  | marca                          |
        | dos minutos  | 11:32 | está marcada como duplicada    |
        | tres minutos | 11:33 | no está marcada como duplicada |

    Escenario: Ya lo registré a mano ese día
      Dado que registré a mano "S/ 25.90" en "Tambo" el 03/10/2026
      Cuando llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 18:00 del 03/10/2026
      Entonces la captura está marcada como duplicada

    Escenario: Una duplicada se puede confirmar
      Dado que registré a mano "S/ 25.90" en "Tambo" el 03/10/2026
      Y que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 18:00 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Cuando confirmo la captura
      Entonces se registra un gasto de "S/ 25.90" desde el iPhone con su captura

  Regla: Las reglas sugieren la categoría por el comercio, sin tildes ni mayúsculas

    Escenario: El comercio contiene el texto de la regla
      Dado que tengo la regla "tambo" para "Comida"
      Cuando llega del iPhone un gasto de "S/ 9.90" en "TAMBÓ Larco" a las 11:30 del 03/10/2026
      Entonces la captura sugiere la categoría "Comida"

    Escenario: Gana la de mayor prioridad, aunque otra sea más larga
      Dado que tengo la regla "tambo larco" para "Comida"
      Y que tengo la regla "larco" para "Antojos" con prioridad 5
      Cuando llega del iPhone un gasto de "S/ 9.90" en "Tambo Larco" a las 11:30 del 03/10/2026
      Entonces la captura sugiere la categoría "Antojos"

    Escenario: Una regla de otro tipo no aplica
      Dado que tengo la regla "tambo" para "Sueldo"
      Cuando llega del iPhone un gasto de "S/ 9.90" en "Tambo" a las 11:30 del 03/10/2026
      Entonces la captura no sugiere categoría

    Escenario: Una regla nueva pone su categoría a lo que espera sin categoría
      Dado que llega del iPhone un gasto de "S/ 9.90" en "Tambo" a las 11:30 del 03/10/2026
      Cuando creo la regla "tambo" para "Comida"
      Entonces la captura sugiere la categoría "Comida"

  Regla: El método de pago se reconoce por los últimos 4, y da la moneda

    Escenario: La tarjeta de los últimos 4
      Dado que tengo la tarjeta "Visa BCP" terminada en "4242" en soles
      Cuando llega del iPhone un gasto de "25.90" en "Tambo" con la tarjeta "····4242" a las 11:30 del 03/10/2026
      Entonces la captura reconoce el método "Visa BCP"
      Y la captura es de "S/ 25.90" en "Tambo" del 03/10/2026

    Escenario: Un número de tarjeta completo nunca se guarda
      Dado que tengo la tarjeta "Visa BCP" terminada en "4242" en soles
      Cuando llega de Android la notificación "Compra de S/ 50.00 con 4111 1111 1111 4242" a las 11:30 del 03/10/2026
      Entonces lo guardado de la captura no tiene el número de la tarjeta
      Y la captura avisa "CARD_NUMBER_MASKED"
      Y la captura reconoce el método "Visa BCP"

  Regla: Confirmar crea una sola transacción, con su captura y su origen

    Escenario: Se confirma una captura completa
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Cuando confirmo la captura
      Entonces se registra un gasto de "S/ 25.90" desde el iPhone con su captura
      Y la captura ya no tiene lo que llegó del teléfono

    Escenario: Confirmar dos veces no crea otra
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Y que confirmo la captura
      Cuando intento confirmar la captura
      Entonces se rechaza con "CAPTURE_NOT_PENDING"
      Y la captura tiene 1 transacción

    Escenario: Sin categoría no se confirma
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Cuando intento confirmar la captura
      Entonces se rechaza con "CAPTURE_CATEGORY_MISSING"

    Escenario: Recordar la categoría crea la regla del comercio
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Cuando confirmo la captura recordando la categoría
      Y llega del iPhone un gasto de "S/ 7.00" en "tambo" a las 12:30 del 03/10/2026
      Entonces la captura sugiere la categoría "Comida"

  Regla: Se corrige antes de confirmar; cambiar el tipo limpia la categoría

    Escenario: Una captura pasa a ingreso
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Cuando cambio la captura a ingreso
      Entonces la captura no sugiere categoría

  Regla: Descartar se deshace y la captura vuelve como estaba

    Escenario: Una duplicada descartada vuelve duplicada
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:31 del 03/10/2026
      Cuando descarto la captura
      Y deshago el descarte
      Entonces la captura está marcada como duplicada
      Y la bandeja tiene 2 capturas

  Regla: Cada quien ve y confirma solo lo suyo

    Escenario: Bruno no ve ni confirma una captura de Ana
      Dado que llega del iPhone un gasto de "S/ 25.90" en "Tambo" a las 11:30 del 03/10/2026
      Y que corrijo la captura con la categoría "Comida"
      Cuando Bruno intenta confirmar la captura
      Entonces se rechaza con "CAPTURE_NOT_FOUND"
      Y la bandeja de Bruno está vacía
