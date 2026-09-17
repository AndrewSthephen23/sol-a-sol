---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Feature flags por módulo y navegación que se arma sola. En la API, `FeatureFlagsService` y el guard `@RequiresFeature` dejan integrar un módulo incompleto a `main` sin exponerlo: solo se activa con el valor exacto `true` en su variable (`FEATURE_BUDGETING`), y una ruta apagada responde 404 para no revelar que existe. En la web, cada funcionalidad declara un manifest (`id`, `título`, `ruta`, `icono` y flag) y la barra de secciones se construye leyendo el registro, así que un módulo nuevo aparece sin editar el layout.
