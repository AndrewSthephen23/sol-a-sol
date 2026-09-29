---
'@sol-a-sol/web': patch
---

Lista de transacciones en `/transactions`: los movimientos de un mes agrupados por día, con los totales por moneda de todo lo filtrado y «Cargar más» por cursor. Filtros por tipo (o solo transferencias), categoría y etiqueta, búsqueda y cambio de mes, todo en la URL y sin recargar la página. El mes por defecto es el de hoy en Lima. Las pantallas privadas se renderizan en cada petición, así que la navegación y las pantallas leen los feature flags al arrancar y no los del build. `catalog` sale de la navegación hasta que exista su pantalla.
