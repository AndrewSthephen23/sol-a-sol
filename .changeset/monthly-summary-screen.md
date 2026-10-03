---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Pantalla «Resumen» (`/reports`): el cierre del mes en texto y por moneda, con lo que entró y salió comparado con el mes anterior, la tasa de ahorro, en qué y dónde se gastó más, el presupuesto, las tarjetas y las metas, y «Descargar CSV».

- El dashboard pasa a llamarse «Inicio» y enlaza «Ver el cierre del mes».
- Las secciones de un módulo apagado no se dibujan. El selector de mes no ofrece meses futuros.
- En OpenAPI, las secciones `budget`, `cards` y `goals` del resumen pasan a ser opcionales: no vienen si su módulo está apagado.
