---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

`GET /reports/monthly-summary/export?year=&month=&format=csv`: el cierre del mes como archivo CSV (`resumen-2026-09.csv`).

- Un solo archivo con todas las secciones como filas, separado por `;`, con BOM UTF-8, montos con punto decimal y sin separador de miles, y porcentajes con 2 decimales. Las categorías van por su nombre.
- Nada de lo que escribió el usuario se ejecuta como fórmula al abrirlo en Excel o Sheets.
- Un formato que no sea `csv` responde 422; las secciones de un módulo apagado no vienen.
