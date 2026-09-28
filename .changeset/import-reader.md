---
'@sol-a-sol/domain': patch
---

Lector de CSV para la importación (`readCsv`: coma o punto y coma, comillas, BOM, finales de Windows) y la interpretación de cada fila del formato oficial (`interpretImportRow`), con su huella para no importar dos veces lo mismo (`importFingerprints`). El formato queda documentado en `docs/modules/transactions-import-format.md`.
