# @sol-a-sol/domain

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 4493180: Fechas de negocio sin hora (`LocalDate`) y el puerto `Clock`. `LocalDate` valida fechas reales (rechaza el 30 de febrero), lee ISO (`2026-09-17`) y formato peruano cuando el origen lo justifica (`17/09/2026`), suma días y meses ajustando al último día del mes cuando el destino es más corto (un día de corte 31 cierra el 30 de abril o el 28 de febrero), y convierte un instante a la fecha de Lima. `Clock` permite fijar el "hoy" en las pruebas, así que los cálculos de vencimientos y ciclos son reproducibles.
- 2ecbc7f: Nuevo value object `Money` para montos exactos en soles y dólares (con `decimal.js`, nunca `number`): suma, resta y multiplicación sin errores de coma flotante; redondeo bancario a 2 decimales solo al presentar o persistir; porcentajes con 2 decimales y sin dividir por cero; y reparto en cuotas sin perder céntimos, asignando los sobrantes a las primeras. Rechaza montos con más de 2 decimales y operaciones entre monedas distintas.
- b1b0bd1: Nuevo paquete `@sol-a-sol/domain` para la lógica de negocio pura, con cobertura mínima del 90 %, mutation testing con Stryker y reglas de ESLint que impiden usar el reloj real, valores aleatorios, APIs de Node o frameworks. Primera pieza: las monedas soportadas (`PEN`, `USD`) y la base de los errores de dominio.
- 64a6c88: Lectura de montos escritos como texto: `parseAmount` convierte `"S/ 1,234.50"`, `"US$ 20"` o `"25.90"` en `Money` (formato peruano con punto decimal; `$` es dólares; la moneda por defecto la indica quien llama), y `findAmountInText` extrae el monto de una notificación bancaria completa, considerando solo los montos pegados a una moneda para no confundirlos con los dígitos de la tarjeta, fechas o cuotas. Si el texto trae montos distintos, no adivina: lanza un error para que la captura se revise a mano.
