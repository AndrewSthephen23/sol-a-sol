# language: es
Característica: Identidad
  Para que mis finanzas sean solo mías
  Como dueño de la plataforma
  Quiero controlar quién entra, con qué credenciales y por cuánto tiempo

  # Reglas decididas con el autor el 2026-09-18 (ver docs/modules/identity.md).
  # Los escenarios de cada regla se detallan en la tarea de H2 que la implementa.

  Regla: El registro está cerrado después del primer usuario

    Escenario: La primera persona que llega se queda con la plataforma
      Dado que no existe ningún usuario
      Cuando me registro con un correo y una contraseña válida
      Entonces la cuenta queda creada como dueña de la plataforma

    Escenario: Nadie más puede registrarse
      Dado que ya existe un usuario
      Cuando alguien intenta registrarse
      Entonces la respuesta es 404
      # 404 y no 403: un 403 confirmaría que la ruta existe.

  Regla: Una contraseña vale por su longitud, no por sus símbolos

    Escenario: Se acepta una contraseña larga sin números ni mayúsculas
      Dado que me estoy registrando
      Cuando elijo una contraseña de 12 caracteres o más que no está en la lista de filtradas
      Entonces se acepta

    Escenario: Se rechaza una contraseña corta
      Dado que me estoy registrando
      Cuando elijo una contraseña de menos de 12 caracteres
      Entonces se rechaza indicando la longitud mínima

    Escenario: Se rechaza una contraseña conocida
      Dado que me estoy registrando
      Cuando elijo una contraseña que aparece en la lista de filtradas
      Entonces se rechaza aunque tenga 12 caracteres o más

  Regla: Los intentos fallidos se frenan con un bloqueo que crece

    Escenario: El quinto fallo bloquea un minuto
      Dado que fallé la contraseña 4 veces seguidas
      Cuando fallo una quinta vez
      Entonces no puedo volver a intentarlo durante 1 minuto

    Escenario: El bloqueo se dobla y tiene tope
      Dado que ya me bloquearon varias veces seguidas
      Cuando vuelvo a agotar los intentos
      Entonces el bloqueo se dobla hasta un máximo de 15 minutos
      # El tope evita que un tercero me deje fuera de mi cuenta indefinidamente.

    Escenario: Entrar bien borra la cuenta de fallos
      Dado que fallé la contraseña 3 veces
      Cuando entro con la contraseña correcta
      Entonces el contador de intentos vuelve a cero

  Regla: Cambiar la contraseña cierra las sesiones pero no rompe el celular

    Escenario: Las demás sesiones se cierran
      Dado que tengo la sesión abierta en dos navegadores
      Cuando cambio la contraseña en uno
      Entonces el otro deja de tener sesión

    Escenario: El token del celular sigue sirviendo
      Dado que tengo un token personal en el celular
      Cuando cambio la contraseña
      Entonces el token sigue sirviendo y se me avisa que puedo revocarlo
