---
'@sol-a-sol/tooling': patch
---

`pnpm gen:module` ya registra bien un módulo cuando la lista de destino ocupa varias líneas. Antes agregaba `, NuevoModule` después de la coma final, y el `AppModule` quedaba con un hueco (`[a, , b]`) que NestJS recibe como un import `undefined`. Es la forma que tiene el `AppModule` desde H2, así que el generador fallaba con cualquier módulo nuevo.
