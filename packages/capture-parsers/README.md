# @sol-a-sol/capture-parsers

Lectores de las notificaciones de bancos y billeteras: del texto de una notificación a una captura **entendida** (monto, comercio, últimos 4 de la tarjeta, gasto o ingreso, avisos). Lo usa el módulo `capture` de la API al recibir lo que manda el teléfono. Es **puro**, como `@sol-a-sol/domain`: no conoce usuarios, base de datos ni NestJS.

## Cómo funciona

`parseNotification(text)`:

1. **Tapa los números de tarjeta** antes de que nadie los lea: toda tira de 13 o más dígitos (juntos o en grupos de 3 o más) queda en `••••1111`, con el aviso `CARD_NUMBER_MASKED` (CLAUDE.md, regla 6). Tapar de más, como un número de cuenta o un CCI, no hace daño.
2. **Elige el parser** de la fuente: el primero de `PARSERS` cuyo `matches` reconoce el texto.
3. Si ninguno lo reconoce, hace una **lectura genérica**: un **gasto** con el monto que encuentre `findAmountInText` (solo montos pegados a una moneda) y el aviso `UNKNOWN_SOURCE`. Si era un ingreso, se corrige en la bandeja.
4. **Nunca lanza:** lo que no entiende vuelve en `null` con su aviso (`AMOUNT_NOT_FOUND`, `AMBIGUOUS_AMOUNT`, `INVALID_AMOUNT`). Un parser que falla cae a la lectura genérica con `PARSER_FAILED`. La captura se guarda siempre.

Devuelve también el texto ya enmascarado (`text`), que es el que se puede guardar.

## Agregar un banco

1. **Fixtures** en `fixtures/<fuente>/`: cada notificación en un `.txt` y lo que debe salir en su `.expected.json`. **Nunca datos reales:** nombres, números de operación y últimos 4 se reemplazan por valores inventados con la misma forma.
2. **Parser** que cumpla `CaptureParser`, registrado en `src/parsers.ts`.

`src/fixtures.spec.ts` recorre todos los fixtures: no se toca al agregar un banco.

## Reglas (verificadas automáticamente)

Las mismas que el dominio (ver su [README](../domain/README.md)): sin frameworks ni APIs de Node, determinista, cobertura ≥ 90 %. El **mutation score exigido es 100 %** (`break` en `stryker.config.json`).

## Comandos

```bash
pnpm --filter @sol-a-sol/capture-parsers test           # pruebas y fixtures
pnpm --filter @sol-a-sol/capture-parsers test:mutation  # Stryker
```
