# @sol-a-sol/api

## 0.7.0

### Minor Changes

- 196392f: Cierra el hito **H6 — Metas y resúmenes**: el módulo `goals` queda **encendido**.

  - **Metas de ahorro:** cuánto quieres juntar y para cuándo, con aportes y retiros a mano o enlazados a un ahorro que ya registraste. Cada meta dice cuánto va, cuánto falta, cuánto aportar al mes y si va bien, en riesgo, cumplida o vencida.
  - **Resumen mensual:** el cierre de un mes, comparado con el anterior, con la tasa de ahorro, en qué y dónde se gastó más, el presupuesto, las tarjetas y las metas. Se descarga en CSV.
  - **Resumen anual:** el año mes a mes, en barras y en una tabla, con la tasa de ahorro del año.
  - El dashboard pasa a llamarse «Inicio» en el menú; «Resumen» tiene las vistas mensual y anual.

### Patch Changes

- 473e6b3: Resumen anual: `computeAnnualSummary` en el dominio y `GET /reports/annual?year=` en la API.

  - Por moneda, una fila por concepto (ingresos, gasto fijo, gasto variable, total gasto, ahorro, inversión, deuda y saldo) con sus 12 meses y su total. Un mes que todavía no llega viene vacío, no en cero.
  - La tasa de ahorro del año (con inversión, `null` sin ingresos) y el gasto del año por categoría, con el mismo reparto que la dona del dashboard (`expenseDistribution`, extraído de `buildMonthlyDashboard`).
  - Un año fuera de 2000 a 2100, o que todavía no empieza, responde 422.

- 47f09e7: API de metas de ahorro, detrás de `FEATURE_GOALS` (todavía apagado): `GET/POST /goals`, `PATCH /goals/{id}` y `GET/POST/DELETE /goals/{id}/contributions`, con el progreso de cada meta calculado al consultar.

  - Un aporte es **manual** (aporte o retiro, con monto positivo y fecha de hoy o antes) o **enlazado** a una transacción entera de ahorro o inversión, que sigue si se corrige, se borra o se restaura. Una transacción aporta a una sola meta.
  - La moneda de la meta queda fija al crearla. Una meta archivada no recibe aportes nuevos, pero se corrige y se le deshacen aportes.
  - Un retiro, o deshacer un aporte, no puede dejar la meta en negativo.
  - Contratos estrictos en `@sol-a-sol/contracts`, rutas en OpenAPI y cliente de la web regenerado.

- 59c99ee: Empieza el hito **H6**: nace el módulo `goals` (apagado con `FEATURE_GOALS=false`) con sus tablas, `savings_goals` y `goal_contributions`. Todavía no tiene endpoints.

  - Una meta tiene nombre (único por cuenta sin distinguir mayúsculas), objetivo mayor que cero en una sola moneda (`NUMERIC(18,2)`) y fechas de inicio y fin libres, con el fin después del inicio.
  - Un aporte es **manual** (fecha y monto positivo, aporte o retiro) o está **enlazado** a una transacción entera, sin fecha ni monto propios. Una transacción aporta a una sola meta, y un retiro no se enlaza.
  - La base exige que el aporte sea de la misma cuenta que su meta y que su transacción.

  Las reglas de las metas, decididas con el autor, quedan escritas en `docs/modules/goals.md`.

- 1b8a68d: Pantalla de metas (`/goals`), detrás de `FEATURE_GOALS` (todavía apagado): crear y corregir una meta, aportar a mano o enlazando una transacción de ahorro, retirar, quitar un aporte con «Deshacer» y archivar.

  - Cada meta dice en texto cuánto va, cuánto falta, cómo va y cuánto aportar al mes; la barra de avance solo lo acompaña.
  - El progreso trae `behind`: cuánto falta para ir al día, calculado en el dominio (`computeGoalProgress`), para el «En riesgo: te faltan S/ … para ir al día».
  - El menú pasa a dos líneas cuando sus secciones no caben en el teléfono, en vez de desbordar la página.

- 2f43e3c: `GET /reports/monthly-summary?year=&month=`: el cierre de un mes, calculado con `computeMonthlySummary`. Un mes cerrado se compara con el anterior entero; el mes en curso, hasta hoy y contra el anterior hasta el mismo día. Un mes que no empezó responde 422 (`SUMMARY_MONTH_IN_FUTURE`).

  - `reports` lee cada módulo por su API pública y un puerto propio: los totales por comercio de `transactions` (nuevo `totalsByMerchant`) y los nuevos `BudgetingLookup`, `CreditCardsLookup` y `GoalsLookup`.
  - Si `budgeting`, `credit-cards` o `goals` están apagados, su sección no se consulta ni aparece, tampoco en OpenAPI.
  - El cliente de la web, regenerado.

- 7573ce9: `GET /reports/monthly-summary/export?year=&month=&format=csv`: el cierre del mes como archivo CSV (`resumen-2026-09.csv`).

  - Un solo archivo con todas las secciones como filas, separado por `;`, con BOM UTF-8, montos con punto decimal y sin separador de miles, y porcentajes con 2 decimales. Las categorías van por su nombre.
  - Nada de lo que escribió el usuario se ejecuta como fórmula al abrirlo en Excel o Sheets.
  - Un formato que no sea `csv` responde 422; las secciones de un módulo apagado no vienen.

- ca8b899: Pantalla «Resumen» (`/reports`): el cierre del mes en texto y por moneda, con lo que entró y salió comparado con el mes anterior, la tasa de ahorro, en qué y dónde se gastó más, el presupuesto, las tarjetas y las metas, y «Descargar CSV».

  - El dashboard pasa a llamarse «Inicio» y enlaza «Ver el cierre del mes».
  - Las secciones de un módulo apagado no se dibujan. El selector de mes no ofrece meses futuros.
  - En OpenAPI, las secciones `budget`, `cards` y `goals` del resumen pasan a ser opcionales: no vienen si su módulo está apagado.

- Updated dependencies [473e6b3]
- Updated dependencies [196392f]
- Updated dependencies [47f09e7]
- Updated dependencies [d035d5d]
- Updated dependencies [1b8a68d]
- Updated dependencies [7573ce9]
- Updated dependencies [dad66bf]
  - @sol-a-sol/domain@0.7.0
  - @sol-a-sol/contracts@0.7.0

## 0.6.0

### Minor Changes

- 3d735d8: Cierra el hito **H5 — Tarjetas de crédito**: el módulo `credit-cards` queda **encendido**.

  - Configurar cada tarjeta (línea en una moneda, día de corte, fecha límite de pago y saldo inicial opcional) y ver dónde está hoy: ciclo, lo que se debe por moneda, uso de la línea, el último estado de cuenta con su fecha límite y si está pagado.
  - Compras en cuotas, con el reparto visto antes de guardar y lo que falta en cada tarjeta.
  - Avisos en el resumen cuando una tarjeta usa más del 30 % de su línea o su pago vence pronto.

### Patch Changes

- b05a2dc: Configurar una tarjeta de crédito (módulo `credit-cards`, todavía apagado): `GET /credit-cards`, `POST /credit-cards` y `PATCH /credit-cards/{id}`.

  - Un método de pago `CREDIT_CARD` propio y activo se configura **una vez** con su línea (en una moneda que acepte), su día de corte, su regla de pago y, si hace falta, un saldo inicial por moneda con fecha de hoy o antes.
  - La lista incluye las tarjetas cuyo método se archivó; se pueden seguir corrigiendo.
  - `CatalogLookup` dice el tipo del método y, en la lista, su banco y sus últimos 4.
  - El cliente de la web se regeneró con las rutas nuevas.

- 554650c: Compras en cuotas (módulo `credit-cards`, todavía apagado): `GET/POST /credit-cards/{id}/installments` y `DELETE /credit-cards/{id}/installments/{planId}`, con la tabla `installment_plans`.

  - Una compra con la tarjeta se marca en 2 a 36 cuotas, con o sin intereses (el total del banco). Las cuotas suman exactamente el total.
  - **El plan sigue a la compra**: se lee como está hoy; borrada se ignora hasta que se restaure, y si deja de tener sentido queda inválido.
  - En el estado de la tarjeta: la deuda incluye la compra y el interés, el estado de cuenta solo las cuotas facturadas y el consumo del ciclo la cuota del ciclo. Presupuesto y dashboard no cambian.

- 21ccb9d: Empieza el hito **H5**: nace el módulo `credit-cards` (apagado con `FEATURE_CREDIT_CARDS=false`) con su tabla, `credit_cards`. Todavía no tiene endpoints.

  - Una configuración por **método de pago** `CREDIT_CARD`: línea en una moneda (`NUMERIC(18,2)`, cero o más), día de corte (1 a 31) y regla de pago (N días después del corte, o un día fijo del mes).
  - Saldo inicial **opcional**, uno por moneda, con su fecha.
  - La base exige que la tarjeta sea de la misma cuenta que su método de pago y que el método sea una tarjeta de crédito.

  Las reglas de las tarjetas, decididas con el autor, quedan escritas en `docs/modules/credit-cards.md`.

- 174ec7c: Estado de una tarjeta de crédito (módulo `credit-cards`, todavía apagado): `GET /credit-cards/status` y `GET /credit-cards/{id}/status`.

  - Ciclo en curso, lo que se debe y lo cargado en el ciclo, por moneda y sin convertir nunca; utilización de la línea; el último estado cerrado con su monto (la deuda total el día del corte), lo pagado después, lo que falta, la fecha límite y si está pagado; y el aviso de pago.
  - Suben la deuda las compras, los cargos y sacar efectivo con la tarjeta; la bajan pagarla (con lo que llegó) y las devoluciones.
  - `TransactionsLookup` suma por día lo que pasó con un método de pago, transferencias incluidas (`paymentMethodTotalsByDay`).

- Updated dependencies [3d735d8]
- Updated dependencies [b05a2dc]
- Updated dependencies [f08e279]
- Updated dependencies [554650c]
- Updated dependencies [174ec7c]
- Updated dependencies [af551ba]
  - @sol-a-sol/domain@0.6.0
  - @sol-a-sol/contracts@0.6.0

## 0.5.0

### Minor Changes

- 7754459: Cierra el hito **H4 — Presupuesto y dashboard**: ya se puede planear el mes y ver cómo va. Los módulos `budgeting` y `reports` quedan **encendidos** (`FEATURE_BUDGETING=true`, `FEATURE_REPORTS=true`):

  - **Presupuesto** por categoría madre y moneda, para cualquier mes, con lo real al lado: lo que queda o cuánto me pasé en un límite, lo que falta o si se cumplió una meta, el % ejecutado y lo gastado sin partida. Se copia del mes anterior completando solo lo que falta y sigue las fusiones de categorías.
  - **Dashboard del mes** en la página de inicio: KPIs por moneda, gasto por día, dona por categoría y tablas por tipo, con cada gráfico explicado también en texto y la política de contenido todavía sin `'unsafe-inline'`.

  El aislamiento por usuario está probado en los 4 endpoints nuevos con la sesión de otra cuenta, los escenarios Gherkin de los dos módulos se ejecutan (cada regla se comprobó rompiéndola) y la checklist de OWASP ASVS queda al día.

### Patch Changes

- d9922ff: El presupuesto de un mes trae lo real al lado de lo planeado, todavía con el módulo apagado: por tipo y moneda, cada partida con su diferencia, su % ejecutado (sin redondear, `null` con lo planeado en cero) y su estado, la fila «Sin presupuesto» y el total del tipo. Lo real de una subcategoría suma en su madre, solo cuenta el mes pedido, sin transferencias ni borradas, y nunca se convierte moneda.

  `transactions` ofrece por primera vez una lectura a otros módulos por su API pública, `TransactionsLookup`: totales por categoría, tipo y moneda entre dos fechas. La usará también el dashboard.

- 1535191: `POST /api/v1/budgets/{year}/{month}/copy-from-previous`: copia al mes las partidas que le faltan, del mes anterior o del último con presupuesto, sin pisar ninguna. Las categorías archivadas no se copian y la respuesta dice cuáles quedaron fuera; sin ningún mes anterior con presupuesto responde sin copiar nada, no con un error.

  El presupuesto sigue las fusiones de categorías: escucha `catalog.category.merged` y pasa las partidas a la destino en todos los meses, sumándolas si la destino ya tenía una ese mes en esa moneda.

- c1a205f: `GET` y `PUT /api/v1/budgets/{year}/{month}`: leer y guardar el presupuesto de un mes, todavía con el módulo apagado. Un mes sin presupuesto responde sus partidas, ninguna, no un 404. Guardar reemplaza el mes entero, toda o nada: cada partida en una categoría madre y activa de la cuenta, una por categoría y moneda, con un monto de cero o más, en cualquier mes. Una partida que el mes ya tenía se puede volver a mandar aunque su categoría se haya archivado después.

  `CatalogLookup` dice ahora si una categoría es de primer nivel. Y una partida cuelga también directo de su usuario: sin eso, borrar una cuenta con presupuesto fallaba.

- ce70003: Empieza el hito **H4**: nace el módulo `budgeting` (apagado con `FEATURE_BUDGETING=false`) con sus dos tablas, `budgets` y `budget_lines`. Todavía no tiene endpoints.

  - Un presupuesto por **mes y cuenta**; una partida por **categoría y moneda**, con su monto planeado en `NUMERIC(18,2)`, cero o más.
  - La base exige que la partida sea de la misma cuenta que su presupuesto y que su categoría, y que su tipo sea el de la categoría.

  Las reglas del presupuesto, decididas con el autor, quedan escritas en `docs/modules/budgeting.md`.

- 0457810: Nace el módulo `reports` (apagado con `FEATURE_REPORTS=false`), de solo lectura y sin tablas propias, con `GET /api/v1/reports/monthly`: el dashboard del mes en una llamada, por moneda y sin convertir nunca. Trae los KPIs (ingresos, gastos, ahorro, deuda y saldo), el gasto diario con los días en cero (el mes en curso hasta hoy en Lima), la dona del gasto por categoría madre con las 6 mayores y «Otras», y las tablas por tipo. Lo arma `buildMonthlyDashboard` en el dominio, con mutation testing al 100 %.

  `TransactionsLookup` suma `totalsByDay`. `reports` no entra en la navegación: el dashboard vivirá en `/`.

- Updated dependencies [6a41264]
- Updated dependencies [c1a205f]
- Updated dependencies [532d993]
- Updated dependencies [0457810]
  - @sol-a-sol/domain@0.5.0
  - @sol-a-sol/contracts@0.5.0

## 0.4.0

### Minor Changes

- fe48c6f: Cierra el hito **H3 — Catálogo y transacciones**: ya se registran gastos de verdad. Los módulos `catalog` y `transactions` quedan **encendidos** (`FEATURE_CATALOG=true`, `FEATURE_TRANSACTIONS=true`): categorías con su semilla, jerarquía, fusión y conversión en etiqueta; métodos de pago; transacciones con corrección, borrado que se deshace y listado con filtros, búsqueda, cursor y totales; transferencias entre cuentas propias; etiquetas; e importación CSV en dos pasos, todo o nada.

  Es el primer hito con **interfaz**: inicio de sesión con segundo factor, la lista del mes, el formulario rápido pensado para el teléfono y la importación, con una política de contenido estricta con nonce. El aislamiento por usuario está probado en los 24 endpoints nuevos con la sesión de otra cuenta, y la checklist de OWASP ASVS queda al día.

  La web **no** muestra todavía la gestión del catálogo: su flag tiene que estar encendido para que las transacciones tengan categorías y métodos, pero la pantalla `/catalog` quedó para después de H3, así que su manifest no está en la navegación.

### Patch Changes

- 5d4d3d9: Escenarios Gherkin ejecutables: `pnpm test:bdd` corre los `.feature` de `features/` con Cucumber contra el dominio y los casos de uso, con los fakes de los puertos (sin base de datos, sin Nest y sin navegador), y tiene su job de CI. Es estricto: un paso sin implementar falla. `transactions.feature` tiene todos sus pasos; los demás archivos, el escenario de la tasa de ahorro (H6) y el esqueleto que crea `pnpm gen:module` van con `@pendiente` hasta que tengan los suyos.
- 15cd2a4: Categorías en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/categories`, con las subcategorías anidadas. No hay `DELETE`: una categoría se archiva.

  - **Un solo nivel de subcategorías.** La subcategoría hereda el tipo de su madre, y también su color e ícono si no se indican.
  - **El nombre no se repite** entre hermanas del mismo tipo, sin distinguir mayúsculas **ni acentos** ("Café" = "cafe"). La ñ sí cuenta.
  - **Archivar una categoría archiva sus subcategorías.** Al restaurarla vuelven solo las que se archivaron con ella, y una subcategoría no se restaura mientras su madre siga archivada.
  - **El tipo y la madre no se cambian.** Archivar no reescribe las transacciones que ya usan la categoría.

- 0ca2e50: **Cada cuenta nueva nace con sus categorías.** Son 22 categorías y 12 subcategorías, con la lista acordada con el autor: ingresos, vivienda, suscripciones, comida, transporte, ahorro (incluida la CTS), inversión y deuda. Se crean al registrarse y se editan como cualquier otra.

  - **Primer evento de dominio:** `identity` avisa que se registró una cuenta y `catalog` la siembra, sin que `identity` sepa que `catalog` existe. Usa `@nestjs/event-emitter` detrás de un puerto propio, y cómo se publican y escuchan los eventos queda en el ADR-0004.
  - **`pnpm db:seed`** siembra las cuentas creadas antes de la semilla, pero solo las que no tienen ninguna categoría. Se puede correr las veces que haga falta sin duplicar nada. En producción es `node dist/seed.js`, y nunca corre solo.

- 6bb506d: Empieza el hito **H3**: nace el módulo `catalog` (apagado con `FEATURE_CATALOG=false`) con sus dos tablas, `categories` y `payment_methods`. Todavía no tiene endpoints.

  Lo que la base ya exige por su cuenta, aunque alguien se salte la aplicación:

  - Una subcategoría cuelga de una categoría **del mismo usuario y del mismo tipo**.
  - No hay dos categorías hermanas con el mismo nombre en el mismo tipo, **sin distinguir mayúsculas** y contando las archivadas.
  - De una tarjeta solo se guardan **alias, banco y últimos 4 dígitos**. La moneda es opcional, para las tarjetas bimoneda.

  Es también la primera vez que el proyecto usa enums (`transaction_type`, `payment_method_kind`, `currency`), y van como `ENUM` nativo de PostgreSQL.

- 0c7fd31: Métodos de pago en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/payment-methods` para cuentas, billeteras, tarjetas de crédito y efectivo. No hay `DELETE`: un método se archiva.

  - **De una tarjeta solo se guardan alias, banco y últimos 4 dígitos.** Un número más largo se rechaza, no se recorta, y un campo como `cvv` o `cardNumber` también se rechaza.
  - **Reglas por tipo:** una tarjeta de crédito lleva sus últimos 4 dígitos, una cuenta o billetera lleva moneda (una tarjeta bimoneda no), y el efectivo no tiene banco. Las aplica el dominio y las repite la base con restricciones `CHECK`.
  - **El alias es único** por usuario, sin distinguir mayúsculas y contando los archivados.
  - Todo cambia menos el tipo, y solo desde una sesión: un token personal recibe 403.

  SonarQube Cloud recibe ahora también la cobertura de las pruebas de integración, que son las que ejercitan controllers y repositorios.

- 18e41ed: Convertir una subcategoría en etiqueta (`POST /api/v1/categories/{id}/convert-to-tag`): se fusiona en su madre y sus transacciones quedan con la etiqueta de su nombre. El evento `catalog.category.merged` gana el campo opcional `tag`.
- 089bf1b: Confirmación de la importación (`POST /api/v1/transactions/import`): con una decisión por cada categoría y método de pago que falta o está archivado (crearlo, usar uno propio o restaurarlo), guarda todas las filas con origen `IMPORT` en una sola transacción de base de datos, o ninguna. Omite lo ya importado y responde 409 si otra importación guardó a la vez las mismas filas.
- 5ac731b: Vista previa de la importación (`POST /api/v1/transactions/import/preview`): sin guardar nada, dice qué filas entrarían, cada problema por línea y columna, lo ya importado (huella única por cuenta), y las categorías y métodos de pago por resolver. Límites de 1 MB y 5 000 filas. Además, un cuerpo demasiado grande o un JSON mal escrito ya no responden 500, sino 413 y 400.
- 3f1d6ee: Gestión de etiquetas: `GET /api/v1/tags` (con cuántas transacciones vigentes usan cada una), `PATCH /api/v1/tags/{id}` para renombrar (con el nombre de otra etiqueta, las fusiona) y `DELETE /api/v1/tags/{id}`, que la quita de todas las transacciones.
- c3c7f6e: Fusionar categorías (`POST /api/v1/categories/{id}/merge`): sus transacciones pasan a la destino, sus hijas se mudan con ella y la origen se archiva. `catalog` fusiona y publica `catalog.category.merged`; `transactions` lo escucha y mueve sus filas (ADR-0005). Los totales del listado traen `count`, que sirve de vista previa.
- 7341761: Mudar una subcategoría a otra madre de primer nivel, del mismo tipo y activa, con todas sus transacciones (`parentId` en `PATCH /api/v1/categories/{id}`). Una categoría de primer nivel no se muda (`ONLY_SUBCATEGORIES_MOVE`).
- bae3856: Etiquetas en las transacciones: `tags` al registrar o corregir (se crean al escribirlas; "Almuerzo" y "almuerzó" son la misma), en la respuesta y en el listado, y el filtro `?tag=` con totales de lo etiquetado. Hasta 10 distintas por transacción, sin `|`. Las transferencias no llevan etiquetas.
- 7e40781: Registrar una transacción (`POST /api/v1/transactions`) y leerla por su id (`GET /api/v1/transactions/{id}`), con el evento `transactions.transaction.created`. El monto viaja como string decimal y se guarda sin pérdida en `NUMERIC(18,2)`. Nueva regla de dominio: un método de pago archivado no se usa en transacciones nuevas (`PAYMENT_METHOD_ARCHIVED`). `catalog` expone `CatalogLookup` para que otros módulos comprueben categorías y métodos de pago.
- d0d4541: Nace el módulo `transactions` (apagado con `FEATURE_TRANSACTIONS=false`) con sus reglas de dominio y su tabla. Todavía no tiene endpoints.

  - **El monto siempre es positivo**: el signo lo da el tipo. Para el saldo del mes solo el ingreso suma.
  - **Gasto** es fijo más variable (la deuda va aparte), y **ahorro** es ahorro más inversión, para la tasa de ahorro.
  - **La fecha llega hasta hoy** en la hora de Lima, sin fechas futuras.
  - **La moneda** es la del método de pago si no se indica otra. Si no hay ninguna, se exige: nunca se supone soles ni se convierte.
  - **La categoría** es del mismo tipo que la transacción y no puede estar archivada.

  La tabla guarda la fecha como `DATE` y el monto como `NUMERIC(18,2)` positivo. Además, la base garantiza que la categoría y el método de pago sean del mismo usuario, y la categoría del mismo tipo.

- dd95904: Corregir (`PATCH /api/v1/transactions/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transactions/{id}/restore`) una transacción, con los eventos `transactions.transaction.updated`, `…deleted` y `…restored`. El tipo cambia junto con una categoría de ese tipo, la moneda solo cambia si se indica, y el origen no se corrige.
- e4e1a1b: Listado de transacciones (`GET /api/v1/transactions`): filtros por mes o rango, tipo, categoría (con sus subcategorías), método de pago y moneda; búsqueda sin mayúsculas ni tildes; paginación por cursor estable ante altas y bajas; y totales por moneda de todo lo filtrado. En el dominio, `totalsByCurrency` y `searchKey`, que ahora comparte `categoryNameKey`.
- 7e21ac9: Corregir (`PATCH /api/v1/transfers/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transfers/{id}/restore`) una transferencia, con los eventos `transactions.transfer.updated`, `…deleted` y `…restored`. En un cambio de moneda, corregir el monto enviado exige mandar también el recibido.
- 5a796fa: El listado `GET /api/v1/transactions` trae también las transferencias, mezcladas por fecha y marcadas con `kind` (`transaction` o `transfer`), con el filtro nuevo `?kind=`. Filtrar por tipo o categoría las deja fuera; por cuenta o moneda trae las que salen o llegan. Los totales siguen siendo solo de las transacciones.
- 6043ec6: Transferencias entre cuentas propias (`POST /api/v1/transfers`, `GET /api/v1/transfers/{id}`): plata que cambia de lugar sin contar como ingreso ni gasto. Con un cambio de moneda guarda los dos montos, copiados del voucher, sin convertir nunca. Pagar la tarjeta de crédito pasa a ser una transferencia; **Deuda** queda para préstamos, intereses y comisiones. Completa también las tablas de endpoints y errores de la ficha de `transactions`.
- a4eac34: Cliente de API para la web: `pnpm api:client` exporta el documento OpenAPI de la API con todos los módulos encendidos (sin arrancar Nest ni tocar la base) y genera con `openapi-typescript` los tipos de `apps/web/src/shared/api/schema.gen.ts`, que la web usa con `openapi-fetch`. El archivo se regenera, no se edita, y un job de CI falla si quedó desactualizado.
- b44c3ba: Inicio y cierre de sesión en la web. `/login` pide correo y contraseña y, si la cuenta lo tiene, el código del segundo factor o uno de recuperación; los errores se muestran en español y un 429 dice cuánto esperar. El token de acceso vive solo en memoria y se recupera con la cookie de refresco al recargar; ante un 401 la sesión se renueva una vez (de a una, también entre pestañas) y se reintenta una vez. Las pantallas privadas llevan al login sin sesión y vuelven a donde se quería ir. La web llama a la API por su propio origen: `proxy.ts` reenvía `/api/*` a `API_URL`, leída al arrancar. E2E con Playwright en móvil y escritorio (`pnpm test:e2e`), con su job de CI. El OpenAPI del login documenta ahora el 429 con `Retry-After`.
- Updated dependencies [15cd2a4]
- Updated dependencies [0c7fd31]
- Updated dependencies [18e41ed]
- Updated dependencies [089bf1b]
- Updated dependencies [5ac731b]
- Updated dependencies [99cb32b]
- Updated dependencies [3f1d6ee]
- Updated dependencies [c3c7f6e]
- Updated dependencies [7341761]
- Updated dependencies [bae3856]
- Updated dependencies [7e40781]
- Updated dependencies [d0d4541]
- Updated dependencies [dd95904]
- Updated dependencies [e4e1a1b]
- Updated dependencies [7e21ac9]
- Updated dependencies [5a796fa]
- Updated dependencies [6043ec6]
  - @sol-a-sol/domain@0.4.0
  - @sol-a-sol/contracts@0.4.0

## 0.3.0

### Minor Changes

- e802237: Cierra el hito **H2 — Identidad**: la plataforma ya tiene dueño. El módulo `identity` queda **encendido** (`FEATURE_IDENTITY=true`) con registro, inicio de sesión, sesión renovable, segundo factor con códigos de recuperación, tokens personales para el celular, límite de intentos y bitácora de seguridad.

  Este cambio agrega además lo que faltaba para darlo por cerrado: **`helmet`** con las cabeceras de seguridad (incluida una política de contenido cerrada entera, `default-src 'none'`, que es lo exacto para algo que sirve JSON) y **CORS restringido** a `WEB_ORIGIN`, con credenciales y nunca `*`, porque la sesión viaja en una cookie.

  El aislamiento por usuario pasa a estar probado **endpoint por endpoint**: sin sesión, con una sesión inventada y con la sesión de otra cuenta. Se documentan los controles de OWASP ASVS nivel 1 que cubre el proyecto y los que faltan.

  La navegación de la web **no** muestra identidad todavía: el mismo flag enciende la API y el menú, y la pantalla de `/identity` no existe. El manifest vuelve al registro cuando la haya.

### Patch Changes

- 9c524bc: Ya se puede **cambiar la contraseña** con `POST /api/v1/auth/password`, que pide la actual y aplica a la nueva la misma política que el registro. Una contraseña actual equivocada responde 403, no 401, para que la web no cierre una sesión que sí vale.

  Al cambiarla, y también **al activar el segundo factor**, se cierran las sesiones de los demás navegadores y se conserva la desde la que se hizo el cambio. Los tokens personales **no se revocan**, para no romper en silencio la captura desde el celular: la respuesta trae cuántas sesiones se cerraron y la lista de tokens que siguen valiendo, para ofrecer revocarlos. El cambio queda en la bitácora como `password.changed`.

- 988bdb1: Ya se puede entrar: `POST /api/v1/auth/login` devuelve un token de acceso firmado con HS256 que vale **15 minutos**. La duración vive en `@sol-a-sol/domain` porque es una regla de negocio, y tanto `iat` como `exp` se calculan con el puerto `Clock`, así que una prueba fija el instante y comprueba la caducidad exacta sin esperar. El token lleva solo `sub`, `iat` y `exp`: un JWT va firmado pero no cifrado, y cualquiera que lo intercepte puede leerlo.

  Un correo desconocido y una contraseña equivocada responden **401 con el mismo cuerpo y cuestan lo mismo**: cuando el correo no existe se verifica contra un hash señuelo, calculado al arrancar a partir de una cadena aleatoria. Sin eso, ese caso no hashearía nada y respondería antes, y cronometrando las respuestas se podría averiguar qué correos tienen cuenta.

  El reloj del sistema pasa a ser un módulo global (`TimeModule`), que es el único sitio de la API donde se lee la hora real.

- 7e07708: Andamiaje del módulo `identity`, el primero de negocio, con sus cinco capas, su manifest en la web y su flag `FEATURE_IDENTITY` apagado. Se agregan dos tablas: `personal_access_tokens`, para que un dispositivo use la API sin la contraseña (se guarda solo el hash, con scopes, expiración y revocación, y se borran con la cuenta), y `audit_logs`, la bitácora de seguridad. La bitácora va **sin clave foránea** a propósito: una entrada de auditoría es un hecho inmutable y debe sobrevivir al borrado de quien lo provocó, así que borrar una cuenta no borra la evidencia de lo que hizo. Todavía no hay lógica: la ficha del módulo recoge las reglas decididas para el hito.
- 19e12e9: Ya se puede crear una cuenta: `POST /api/v1/auth/register`. Quién puede hacerlo lo decide `REGISTRATION_MODE`, que por defecto vale `closed` y solo deja pasar a la primera persona, que queda como dueña de la plataforma; también admite `invite`, con un código que se compara en tiempo constante, y `open`. Ante un valor desconocido cierra, para que un error de tipeo no abra el registro a internet.

  Cuando el registro no está permitido, la respuesta es un **404 idéntico al de una ruta que no existe**: un 403 o un mensaje propio confirmarían que el registro está ahí, solo que cerrado. La contraseña pasa por la política del dominio antes de gastarse en hashear, se guarda con argon2id, y la respuesta lleva solo el id, el correo y la fecha: nunca el hash.

  El guard de feature flags pasa a estar registrado globalmente, así que basta con marcar una ruta con `@RequiresFeature` para que responda 404 con el módulo apagado, sin tener que acordarse de un `@UseGuards` en cada controlador.

- ef3f190: Probar contraseñas contra la API deja de ser viable. Cinco fallos seguidos bloquean **un minuto**, y a partir de ahí cada fallo vuelve a bloquear doblando el tiempo: 2, 4, 8 y **15 minutos como tope**, para que nadie pueda dejar al dueño fuera de su cuenta indefinidamente. Se cuentan el correo y la IP **por separado**, y un código de segundo factor o de recuperación equivocado cuenta igual que una contraseña. Entrar bien borra el contador, y un día sin fallos también. El bloqueo responde 429 con `Retry-After`, y el correo se guarda hasheado para que la tabla no sea una lista de quién intentó entrar.

  Encima va un **tope de caudal por IP** (`@nestjs/throttler`): 120 peticiones por minuto, y 20 en `/auth`, donde cada petición cuesta un argon2id. Los health checks quedan fuera.

  Los **logs** pasan a JSON con `pino`, con `requestId`, `userId`, módulo y duración, y con la cabecera `Authorization` y las cookies enmascaradas. La **bitácora** registra ahora también los inicios de sesión, los fallidos y los bloqueos, y se conserva **un año**: una tarea diaria borra lo más viejo y los intentos ya olvidados.

- 50374ab: La API publica su contrato en `/api/v1/openapi.json`, un documento OpenAPI 3.0 que se arma con los **mismos esquemas Zod** con los que valida la entrada: la documentación no puede describir una cosa y el código aceptar otra. Una prueba comprueba además que toda ruta registrada aparezca en el documento, y que no se documente ninguna que no exista, así que añadir un endpoint y olvidar documentarlo deja de poder pasar en silencio.

  Las rutas de un módulo con su feature flag apagado **no aparecen**: describirlas confirmaría justo lo que su 404 se esfuerza en ocultar.

  No se usa `@nestjs/swagger`, que habría sumado unos 17 MB a la imagen de producción (sobre todo `swagger-ui-dist`) para servir documentación. Problem Details pasa a `@sol-a-sol/contracts`, donde ya estaba el resto de lo que viaja por HTTP, así que la web puede tipar los errores que recibe con el mismo esquema del que sale su descripción en el OpenAPI.

- 2439bcf: Las contraseñas ya tienen política y forma de guardarse. En el dominio, `assertPasswordIsStrong` exige **12 caracteres** y nada más —sin mayúsculas ni números obligatorios, siguiendo a NIST SP 800-63B, porque las reglas de composición empujan a patrones previsibles— y rechaza las contraseñas largas y previsibles de una lista embebida: recorridos de teclado, repeticiones y frases muy usadas. Las de las listas de filtraciones famosas no hacen falta, porque el mínimo de longitud ya las descarta. El error dice qué falta sin revelar la regla ni incluir nunca la contraseña.

  En la API, el puerto `PasswordHasher` y su adaptador **argon2id** con los parámetros de OWASP (19 MiB, 2 iteraciones, sin paralelismo). Una contraseña equivocada devuelve `false` en vez de lanzar, y un hash ilegible falla cerrado dejando aviso en el log, para que una cuenta que no puede entrar no se quede sin rastro del motivo.

- 0ea4677: Ya se pueden crear **tokens personales**, para que el celular mande capturas sin la contraseña ni una sesión de navegador. `POST /api/v1/tokens` crea uno y lo muestra **una sola vez**: en la base queda solo el hash de su secreto. `GET /api/v1/tokens` los lista sin su valor, y `DELETE /api/v1/tokens/:id` lo revoca en el acto; el token de otra cuenta responde 404, igual que uno que no existe.

  Un token **siempre caduca**, entre 1 y 365 días (90 si no se indica), y lleva **scopes mínimos**: hoy solo `captures:write`. Solo entra en las rutas marcadas con `@AcceptsPersonalAccessToken`; en cualquier otra recibe 403, así que el token del celular no puede listar tokens, crear otros ni tocar el segundo factor. Uno revocado o caducado responde 401.

  El token (`sas_pat_…`) lleva dentro el id de su fila: se busca por clave primaria y el hash se compara en tiempo constante. La creación, la revocación, cada uso y cada rechazo quedan en la bitácora con su IP y user agent, y `lastUsedAt` dice si un token sigue en uso.

- 69f4901: Toda la API responde ya sus errores en Problem Details (RFC 9457), con `Content-Type: application/problem+json`. El `type` es un URN estable (`urn:sol-a-sol:error:invalid-amount`) y el `code` viaja en el cuerpo para que la web arme el mensaje en español; `title` y `detail` quedan en inglés, para quien depura. Un error de validación responde 422 con un elemento de `errors[]` por campo (`field`, `code`, `message`), un error de dominio responde con su código estable, y cualquier fallo inesperado responde un 500 genérico que no filtra nada del sistema, con el detalle real solo en el log.

  Nace también `@sol-a-sol/contracts`, con los esquemas Zod que comparten la API y la web, empezando por registro e inicio de sesión. Describen la forma del mensaje, no las reglas de negocio: la política de contraseñas se queda en `@sol-a-sol/domain`, para que no acabe definida en dos sitios que un día dejen de coincidir.

- bad95a1: El segundo factor ya tiene red de seguridad. Al activarlo se entregan **diez códigos de recuperación**, mostrados una sola vez; después solo queda su hash. Cada uno sirve una vez y en el inicio de sesión se usan **en lugar** del código del teléfono, así que perderlo deja de significar perder la cuenta.

  Están pensados para copiarse a mano de un papel: alfabeto base32 de Crockford —sin `I`, `L`, `O` ni `U`, que se confunden con `1`, `0` y otras— en grupos de cuatro, y se aceptan tecleados sin guiones, con espacios o en minúsculas. Doce símbolos son unos 60 bits, que no se adivinan probando.

  `POST /api/v1/auth/2fa/recovery-codes` los rehace e invalida los anteriores, y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra.

- 48b352e: La sesión ya se sostiene sola: `POST /api/v1/auth/refresh` y `POST /api/v1/auth/logout`. El refresco viaja en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, limitada a `/api/v1/auth`, y dura **30 días deslizantes**: cada uso emite uno nuevo con otros treinta por delante, así que quien entra a diario no vuelve a escribir la contraseña.

  Cada renovación **invalida el refresco anterior**. Si llega uno ya canjeado, alguien lo copió: como no hay forma de saber si quien lo presenta es la víctima o el ladrón, se cierran **todas** las sesiones de la cuenta y queda registrado en `audit_logs`. Dos pestañas renovando a la vez caen en ese mismo camino, y por eso el `UPDATE` que marca el token lleva dentro la condición de que siga sin usar: solo una gana la carrera.

  Cerrar sesión responde 204 valga la cookie o no, para no delatar si un token que alguien probó existe, y solo cierra esa sesión. Los refrescos se guardan hasheados con SHA-256 —no argon2id, que es lento a propósito para secretos que se pueden adivinar, y estos son 256 bits aleatorios que además hay que poder buscar en un índice.

- 1fa7fbc: Ya se puede activar un segundo factor con cualquier aplicación de autenticación. La activación va en dos pasos: `POST /api/v1/auth/2fa/setup` devuelve el `otpauth://` **una sola vez**, y el factor no queda activo hasta que `2fa/verify` lo confirma con un código, así que escanear mal el QR no deja la cuenta inaccesible. `2fa/disable` lo quita, y exige un código válido porque es una rebaja de seguridad; activar y desactivar quedan en la bitácora.

  Se acepta un periodo de treinta segundos a cada lado, para que un reloj ligeramente desfasado no impida entrar, y **un código sirve una sola vez**: se guarda el último periodo usado, así que quien lo vea por encima del hombro no puede aprovechar los segundos que le queden. Qué contadores se aceptan lo decide el dominio y no la librería, de modo que la ventana se prueba con reloj fijo.

  El secreto se guarda **cifrado** con AES-256-GCM y una clave propia, `AUTH_TOTP_ENCRYPTION_KEY`, no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su cuenta. Entra además el guard del token de acceso, que expone el `userId` a la ruta y es la base del aislamiento por usuario que completa la tarea de cierre.

- Updated dependencies [9c524bc]
- Updated dependencies [988bdb1]
- Updated dependencies [19e12e9]
- Updated dependencies [ef3f190]
- Updated dependencies [50374ab]
- Updated dependencies [2439bcf]
- Updated dependencies [0ea4677]
- Updated dependencies [69f4901]
- Updated dependencies [bad95a1]
- Updated dependencies [48b352e]
- Updated dependencies [1fa7fbc]
  - @sol-a-sol/contracts@0.3.0
  - @sol-a-sol/domain@0.3.0

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 25b3d0f: La imagen de producción de la API ya no lleva la CLI de Prisma. `@prisma/client` declara `prisma` y `typescript` como peers opcionales, y pnpm los resolvía por estar en el workspace, así que `deploy --prod` los copiaba junto con `@prisma/engines`, `@prisma/studio-core` y `@electric-sql/pglite`: unos 190 MB y dos vulnerabilidades HIGH en código que nunca se ejecuta. Con `--no-optional`, la imagen solo contiene lo que la API usa en runtime (el cliente generado y `@prisma/adapter-pg`): `node_modules` baja de 362 MB a 98 MB y la imagen de 865 MB a 523 MB.
- 41faf4f: Feature flags por módulo y navegación que se arma sola. En la API, `FeatureFlagsService` y el guard `@RequiresFeature` dejan integrar un módulo incompleto a `main` sin exponerlo: solo se activa con el valor exacto `true` en su variable (`FEATURE_BUDGETING`), y una ruta apagada responde 404 para no revelar que existe. En la web, cada funcionalidad declara un manifest (`id`, `título`, `ruta`, `icono` y flag) y la barra de secciones se construye leyendo el registro, así que un módulo nuevo aparece sin editar el layout.
- 0d35d9a: Cada versión publica ya sus imágenes de producción en GHCR (`ghcr.io/andrewsthephen23/sol-a-sol-api` y `…-web`), con las etiquetas `X.Y.Z` y `sha-<commit>`, enlazadas en las notas del GitHub Release. Son las mismas imágenes que construye `docker-compose.test.yml`, y no se sube ninguna hasta que pasan el bloqueo de Trivy y un smoke test que las arranca de verdad. Un push a `main` sin versión nueva no publica nada.

## 0.1.0

### Minor Changes

- e6c922b: Hito H0 — Cimientos: monorepo con TypeScript estricto y configuraciones compartidas; hooks de Git (commitlint, lint-staged, gitleaks); API NestJS con `/health` y `/health/ready`; web Next.js; Prisma con el modelo `User` y su primera migración; imágenes Docker multi-stage y Docker Compose; pipelines de CI y seguridad (CodeQL, gitleaks, pnpm audit, Trivy); SonarQube Cloud, plantillas, protección de `main` y ADRs 0001–0003.
