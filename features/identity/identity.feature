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

    Escenario: El correo no distingue mayúsculas
      Dado que no existe ningún usuario
      Cuando me registro con "Ana@Example.COM"
      Entonces la cuenta queda guardada como "ana@example.com"
      # users.email es único: si no, serían dos cuentas distintas.

  Regla: Con invitación, solo entra quien trae el código

    Escenario: Llego con el código correcto
      Dado que el registro está en modo invitación
      Cuando me registro con el código configurado
      Entonces la cuenta queda creada

    Escenario: Llego sin código
      Dado que el registro está en modo invitación
      Cuando me registro sin código
      Entonces la respuesta es 404, la misma que si el registro no existiera

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

  Regla: Entrar devuelve un pase de corta duración

    Escenario: Entro con mi contraseña
      Dado que tengo una cuenta
      Cuando inicio sesión con mi correo y mi contraseña
      Entonces recibo un token de acceso que vale 15 minutos
      Y el token dice quién soy, pero no lleva mi correo ni ningún dato personal

    Escenario: La contraseña no es la mía
      Dado que tengo una cuenta
      Cuando inicio sesión con una contraseña equivocada
      Entonces se me niega el acceso sin decir qué parte falló

    Escenario: El correo no tiene cuenta
      Cuando inicio sesión con un correo que no existe
      Entonces se me niega el acceso con exactamente la misma respuesta que si la contraseña fuera errónea
      # Y tarda lo mismo: si no, cronometrando se sabría qué correos tienen cuenta.

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
