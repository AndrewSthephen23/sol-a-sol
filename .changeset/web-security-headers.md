---
'@sol-a-sol/web': patch
---

La web manda sus cabeceras de seguridad. Cada página lleva una política de contenido con un nonce nuevo por petición (`script-src 'self' 'nonce-…' 'strict-dynamic'`, sin `'unsafe-inline'`, `frame-ancestors 'none'`), que Next aplica a sus propios scripts; por eso toda página se renderiza por petición. Además: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y sin `X-Powered-By`. Los E2E fallan si el navegador bloquea algo por la política.
