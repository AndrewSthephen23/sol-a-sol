---
'@sol-a-sol/web': patch
---

Importar un CSV desde la web (`/transactions/import`). El archivo se lee como texto y se previsualiza sin guardar nada: cuánto entraría, lo ya importado, las etiquetas nuevas, las columnas ignoradas y cada problema por línea y columna, en español. Por cada categoría y método de pago que falta o está archivado se propone crearlo o restaurarlo, o se elige otro existente; un método nuevo se revisa con las reglas del dominio antes de mandarlo. La confirmación entra todo o nada, y volver a importar el mismo archivo no duplica.
