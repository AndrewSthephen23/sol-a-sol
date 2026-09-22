---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
---

Probar contraseñas contra la API deja de ser viable. Cinco fallos seguidos bloquean **un minuto**, y a partir de ahí cada fallo vuelve a bloquear doblando el tiempo: 2, 4, 8 y **15 minutos como tope**, para que nadie pueda dejar al dueño fuera de su cuenta indefinidamente. Se cuentan el correo y la IP **por separado**, y un código de segundo factor o de recuperación equivocado cuenta igual que una contraseña. Entrar bien borra el contador, y un día sin fallos también. El bloqueo responde 429 con `Retry-After`, y el correo se guarda hasheado para que la tabla no sea una lista de quién intentó entrar.

Encima va un **tope de caudal por IP** (`@nestjs/throttler`): 120 peticiones por minuto, y 20 en `/auth`, donde cada petición cuesta un argon2id. Los health checks quedan fuera.

Los **logs** pasan a JSON con `pino`, con `requestId`, `userId`, módulo y duración, y con la cabecera `Authorization` y las cookies enmascaradas. La **bitácora** registra ahora también los inicios de sesión, los fallidos y los bloqueos, y se conserva **un año**: una tarea diaria borra lo más viejo y los intentos ya olvidados.
