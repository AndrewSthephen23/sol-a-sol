---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
---

Las contraseñas ya tienen política y forma de guardarse. En el dominio, `assertPasswordIsStrong` exige **12 caracteres** y nada más —sin mayúsculas ni números obligatorios, siguiendo a NIST SP 800-63B, porque las reglas de composición empujan a patrones previsibles— y rechaza las contraseñas largas y previsibles de una lista embebida: recorridos de teclado, repeticiones y frases muy usadas. Las de las listas de filtraciones famosas no hacen falta, porque el mínimo de longitud ya las descarta. El error dice qué falta sin revelar la regla ni incluir nunca la contraseña.

En la API, el puerto `PasswordHasher` y su adaptador **argon2id** con los parámetros de OWASP (19 MiB, 2 iteraciones, sin paralelismo). Una contraseña equivocada devuelve `false` en vez de lanzar, y un hash ilegible falla cerrado dejando aviso en el log, para que una cuenta que no puede entrar no se quede sin rastro del motivo.
