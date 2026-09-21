---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
---

Ya se puede entrar: `POST /api/v1/auth/login` devuelve un token de acceso firmado con HS256 que vale **15 minutos**. La duración vive en `@sol-a-sol/domain` porque es una regla de negocio, y tanto `iat` como `exp` se calculan con el puerto `Clock`, así que una prueba fija el instante y comprueba la caducidad exacta sin esperar. El token lleva solo `sub`, `iat` y `exp`: un JWT va firmado pero no cifrado, y cualquiera que lo intercepte puede leerlo.

Un correo desconocido y una contraseña equivocada responden **401 con el mismo cuerpo y cuestan lo mismo**: cuando el correo no existe se verifica contra un hash señuelo, calculado al arrancar a partir de una cadena aleatoria. Sin eso, ese caso no hashearía nada y respondería antes, y cronometrando las respuestas se podría averiguar qué correos tienen cuenta.

El reloj del sistema pasa a ser un módulo global (`TimeModule`), que es el único sitio de la API donde se lee la hora real.
