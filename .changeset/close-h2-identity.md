---
'@sol-a-sol/api': minor
'@sol-a-sol/web': minor
---

Cierra el hito **H2 — Identidad**: la plataforma ya tiene dueño. El módulo `identity` queda **encendido** (`FEATURE_IDENTITY=true`) con registro, inicio de sesión, sesión renovable, segundo factor con códigos de recuperación, tokens personales para el celular, límite de intentos y bitácora de seguridad.

Este cambio agrega además lo que faltaba para darlo por cerrado: **`helmet`** con las cabeceras de seguridad (sin política de contenido, porque esto sirve JSON y no páginas) y **CORS restringido** a `WEB_ORIGIN`, con credenciales y nunca `*`, porque la sesión viaja en una cookie.

El aislamiento por usuario pasa a estar probado **endpoint por endpoint**: sin sesión, con una sesión inventada y con la sesión de otra cuenta. Se documentan los controles de OWASP ASVS nivel 1 que cubre el proyecto y los que faltan.

La navegación de la web **no** muestra identidad todavía: el mismo flag enciende la API y el menú, y la pantalla de `/identity` no existe. El manifest vuelve al registro cuando la haya.
