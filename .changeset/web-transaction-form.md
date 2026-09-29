---
'@sol-a-sol/web': patch
---

Registrar, corregir y borrar movimientos desde la web. El formulario rápido pide monto, categoría (de la que sale el tipo), método de pago y fecha; descripción, comercio y etiquetas van plegados, y si la descripción queda vacía se usa el nombre de la categoría. El monto se lee con `parseAmount` del dominio y viaja como texto. Se recuerda el último método de pago del navegador; sin método o con uno bimoneda hay que elegir la moneda, sin valor por defecto. Las transferencias piden el monto recibido cuando cambia la moneda. Borrar muestra «Deshacer» unos segundos en vez de pedir confirmación.
