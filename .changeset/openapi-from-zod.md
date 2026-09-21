---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

La API publica su contrato en `/api/v1/openapi.json`, un documento OpenAPI 3.0 que se arma con los **mismos esquemas Zod** con los que valida la entrada: la documentación no puede describir una cosa y el código aceptar otra. Una prueba comprueba además que toda ruta registrada aparezca en el documento, y que no se documente ninguna que no exista, así que añadir un endpoint y olvidar documentarlo deja de poder pasar en silencio.

Las rutas de un módulo con su feature flag apagado **no aparecen**: describirlas confirmaría justo lo que su 404 se esfuerza en ocultar.

No se usa `@nestjs/swagger`, que habría sumado unos 17 MB a la imagen de producción (sobre todo `swagger-ui-dist`) para servir documentación. Problem Details pasa a `@sol-a-sol/contracts`, donde ya estaba el resto de lo que viaja por HTTP, así que la web puede tipar los errores que recibe con el mismo esquema del que sale su descripción en el OpenAPI.
