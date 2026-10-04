---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

Las reglas de categorización en la API, todavía apagadas (`FEATURE_CAPTURE=false`), solo desde una sesión:

- `GET/POST /categorization-rules` y `PATCH/DELETE /categorization-rules/{id}`: patrón, categoría (de la cuenta y activa) y prioridad. Un patrón repetido en la cuenta, sin tildes ni mayúsculas, responde 409.
- Al crear o cambiar una regla, las capturas de la bandeja sin categoría a las que aplique toman la suya; las que ya tienen una no se tocan.
- Al fusionar una categoría, sus reglas y las capturas sin confirmar pasan a la destino.
