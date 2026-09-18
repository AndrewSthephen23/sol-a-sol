# @sol-a-sol/contracts

Esquemas **Zod** compartidos entre la API y la web: describen **la forma de lo que viaja por HTTP**. La API valida la entrada con ellos y la web reutiliza los mismos esquemas en sus formularios, así que el contrato no se puede desincronizar entre las dos puntas ([ADR-0002](../../docs/adr/0002-stack-typescript.md)).

## Qué va aquí y qué no

|                               | Ejemplo                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Sí:** la forma del mensaje  | Que `email` sea un correo, que `password` sea texto y quepa, que un monto llegue como string decimal    |
| **No:** las reglas de negocio | El mínimo de 12 caracteres y la lista de contraseñas filtradas, el redondeo bancario, los días de corte |

La frontera importa. Duplicar una regla de negocio aquí y en [`@sol-a-sol/domain`](../domain/) es la forma segura de que un día dejen de coincidir y nadie se entere: **la política vive en el dominio, con TDD**; este paquete solo comprueba que el mensaje tenga la forma esperada antes de dejarlo entrar.

Por eso `passwordSchema` acepta una contraseña de tres letras: rechazarla es trabajo del dominio, no del transporte. El único límite que sí se aplica aquí es el máximo, porque argon2id gasta memoria a propósito y una contraseña arbitrariamente larga sería una forma barata de tumbar la API.

## Reglas

- **Sin tipos de Node ni del navegador** (`"types": []`): los contratos los comparten los dos entornos.
- **Los montos viajan como string decimal** (`"1234.50"`), nunca como número ([`CLAUDE.md`](../../CLAUDE.md)).
- El correo se normaliza (se recorta y baja a minúsculas) porque `users.email` es único; la contraseña **no** se toca: sus espacios son parte de ella.

## Cómo se ven los errores

Un fallo de validación sale de la API como Problem Details (RFC 9457) con un elemento de `errors[]` por campo. Lo traduce `ProblemDetailsFilter`, en `apps/api/src/shared/http/`; aquí no se decide nada del formato.

## Contenido

| Módulo                 | Qué es                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| `identity/credentials` | `registerRequestSchema` y `loginRequestSchema`, que usa la tarea 04 de H2 |
