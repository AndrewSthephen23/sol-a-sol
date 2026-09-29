---
'@sol-a-sol/web': patch
'@sol-a-sol/api': patch
---

Inicio y cierre de sesión en la web. `/login` pide correo y contraseña y, si la cuenta lo tiene, el código del segundo factor o uno de recuperación; los errores se muestran en español y un 429 dice cuánto esperar. El token de acceso vive solo en memoria y se recupera con la cookie de refresco al recargar; ante un 401 la sesión se renueva una vez (de a una, también entre pestañas) y se reintenta una vez. Las pantallas privadas llevan al login sin sesión y vuelven a donde se quería ir. La web llama a la API por su propio origen: `proxy.ts` reenvía `/api/*` a `API_URL`, leída al arrancar. E2E con Playwright en móvil y escritorio (`pnpm test:e2e`), con su job de CI. El OpenAPI del login documenta ahora el 429 con `Retry-After`.
