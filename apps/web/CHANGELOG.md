# @sol-a-sol/web

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

- 6a41264: La pantalla del presupuesto (`/budgeting`), todavía con el módulo apagado: el mes en la URL con el mismo selector que las transacciones, lo planeado contra lo real por tipo y moneda con su barra de % ejecutado y una frase que dice qué significa («Quedan…», «Te pasaste…», «Faltan…», «Cumplida»), «Sin presupuesto» y el total del tipo. Se arma y se corrige el mes entero de una vez, y se copia del mes anterior diciendo de dónde y qué quedó fuera. El dominio suma `formatPercentage`: un porcentaje con 2 decimales y redondeo bancario.
- c1a205f: `GET` y `PUT /api/v1/budgets/{year}/{month}`: leer y guardar el presupuesto de un mes, todavía con el módulo apagado. Un mes sin presupuesto responde sus partidas, ninguna, no un 404. Guardar reemplaza el mes entero, toda o nada: cada partida en una categoría madre y activa de la cuenta, una por categoría y moneda, con un monto de cero o más, en cualquier mes. Una partida que el mes ya tenía se puede volver a mandar aunque su categoría se haya archivado después.

  `CatalogLookup` dice ahora si una categoría es de primer nivel. Y una partida cuelga también directo de su usuario: sin eso, borrar una cuenta con presupuesto fallaba.

- ce70003: Empieza el hito **H4**: nace el módulo `budgeting` (apagado con `FEATURE_BUDGETING=false`) con sus dos tablas, `budgets` y `budget_lines`. Todavía no tiene endpoints.

  - Un presupuesto por **mes y cuenta**; una partida por **categoría y moneda**, con su monto planeado en `NUMERIC(18,2)`, cero o más.
  - La base exige que la partida sea de la misma cuenta que su presupuesto y que su categoría, y que su tipo sea el de la categoría.

  Las reglas del presupuesto, decididas con el autor, quedan escritas en `docs/modules/budgeting.md`.

- 1614330: El dashboard del mes en `/`, con `FEATURE_REPORTS` (apagado, y mientras tanto `/` sigue con la bienvenida). Por moneda y sin convertir, muestra:

  - los KPIs, con el saldo negativo en rojo y con signo;
  - las barras de gasto diario, con un resumen en texto;
  - la dona de gasto por categoría, cuya leyenda enlaza a los movimientos de cada categoría;
  - las tablas por tipo.

  El mes va en la URL. Los gráficos usan Recharts y se dibujan solo en el navegador, así la CSP sigue sin `'unsafe-inline'`.

- 0457810: Nace el módulo `reports` (apagado con `FEATURE_REPORTS=false`), de solo lectura y sin tablas propias, con `GET /api/v1/reports/monthly`: el dashboard del mes en una llamada, por moneda y sin convertir nunca. Trae los KPIs (ingresos, gastos, ahorro, deuda y saldo), el gasto diario con los días en cero (el mes en curso hasta hoy en Lima), la dona del gasto por categoría madre con las 6 mayores y «Otras», y las tablas por tipo. Lo arma `buildMonthlyDashboard` en el dominio, con mutation testing al 100 %.

  `TransactionsLookup` suma `totalsByDay`. `reports` no entra en la navegación: el dashboard vivirá en `/`.

- Updated dependencies [6a41264]
- Updated dependencies [532d993]
- Updated dependencies [0457810]
  - @sol-a-sol/domain@0.5.0

## 0.4.0

### Minor Changes

- fe48c6f: Cierra el hito **H3 — Catálogo y transacciones**: ya se registran gastos de verdad. Los módulos `catalog` y `transactions` quedan **encendidos** (`FEATURE_CATALOG=true`, `FEATURE_TRANSACTIONS=true`): categorías con su semilla, jerarquía, fusión y conversión en etiqueta; métodos de pago; transacciones con corrección, borrado que se deshace y listado con filtros, búsqueda, cursor y totales; transferencias entre cuentas propias; etiquetas; e importación CSV en dos pasos, todo o nada.

  Es el primer hito con **interfaz**: inicio de sesión con segundo factor, la lista del mes, el formulario rápido pensado para el teléfono y la importación, con una política de contenido estricta con nonce. El aislamiento por usuario está probado en los 24 endpoints nuevos con la sesión de otra cuenta, y la checklist de OWASP ASVS queda al día.

  La web **no** muestra todavía la gestión del catálogo: su flag tiene que estar encendido para que las transacciones tengan categorías y métodos, pero la pantalla `/catalog` quedó para después de H3, así que su manifest no está en la navegación.

### Patch Changes

- 6bb506d: Empieza el hito **H3**: nace el módulo `catalog` (apagado con `FEATURE_CATALOG=false`) con sus dos tablas, `categories` y `payment_methods`. Todavía no tiene endpoints.

  Lo que la base ya exige por su cuenta, aunque alguien se salte la aplicación:

  - Una subcategoría cuelga de una categoría **del mismo usuario y del mismo tipo**.
  - No hay dos categorías hermanas con el mismo nombre en el mismo tipo, **sin distinguir mayúsculas** y contando las archivadas.
  - De una tarjeta solo se guardan **alias, banco y últimos 4 dígitos**. La moneda es opcional, para las tarjetas bimoneda.

  Es también la primera vez que el proyecto usa enums (`transaction_type`, `payment_method_kind`, `currency`), y van como `ENUM` nativo de PostgreSQL.

- d0d4541: Nace el módulo `transactions` (apagado con `FEATURE_TRANSACTIONS=false`) con sus reglas de dominio y su tabla. Todavía no tiene endpoints.

  - **El monto siempre es positivo**: el signo lo da el tipo. Para el saldo del mes solo el ingreso suma.
  - **Gasto** es fijo más variable (la deuda va aparte), y **ahorro** es ahorro más inversión, para la tasa de ahorro.
  - **La fecha llega hasta hoy** en la hora de Lima, sin fechas futuras.
  - **La moneda** es la del método de pago si no se indica otra. Si no hay ninguna, se exige: nunca se supone soles ni se convierte.
  - **La categoría** es del mismo tipo que la transacción y no puede estar archivada.

  La tabla guarda la fecha como `DATE` y el monto como `NUMERIC(18,2)` positivo. Además, la base garantiza que la categoría y el método de pago sean del mismo usuario, y la categoría del mismo tipo.

- a4eac34: Cliente de API para la web: `pnpm api:client` exporta el documento OpenAPI de la API con todos los módulos encendidos (sin arrancar Nest ni tocar la base) y genera con `openapi-typescript` los tipos de `apps/web/src/shared/api/schema.gen.ts`, que la web usa con `openapi-fetch`. El archivo se regenera, no se edita, y un job de CI falla si quedó desactualizado.
- d8feaab: Importar un CSV desde la web (`/transactions/import`). El archivo se lee como texto y se previsualiza sin guardar nada: cuánto entraría, lo ya importado, las etiquetas nuevas, las columnas ignoradas y cada problema por línea y columna, en español. Por cada categoría y método de pago que falta o está archivado se propone crearlo o restaurarlo, o se elige otro existente; un método nuevo se revisa con las reglas del dominio antes de mandarlo. La confirmación entra todo o nada, y volver a importar el mismo archivo no duplica.
- 714ed8f: La web manda sus cabeceras de seguridad. Cada página lleva una política de contenido con un nonce nuevo por petición (`script-src 'self' 'nonce-…' 'strict-dynamic'`, sin `'unsafe-inline'`, `frame-ancestors 'none'`), que Next aplica a sus propios scripts; por eso toda página se renderiza por petición. Además: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` y sin `X-Powered-By`. Los E2E fallan si el navegador bloquea algo por la política.
- b44c3ba: Inicio y cierre de sesión en la web. `/login` pide correo y contraseña y, si la cuenta lo tiene, el código del segundo factor o uno de recuperación; los errores se muestran en español y un 429 dice cuánto esperar. El token de acceso vive solo en memoria y se recupera con la cookie de refresco al recargar; ante un 401 la sesión se renueva una vez (de a una, también entre pestañas) y se reintenta una vez. Las pantallas privadas llevan al login sin sesión y vuelven a donde se quería ir. La web llama a la API por su propio origen: `proxy.ts` reenvía `/api/*` a `API_URL`, leída al arrancar. E2E con Playwright en móvil y escritorio (`pnpm test:e2e`), con su job de CI. El OpenAPI del login documenta ahora el 429 con `Retry-After`.
- 840064c: Registrar, corregir y borrar movimientos desde la web. El formulario rápido pide monto, categoría (de la que sale el tipo), método de pago y fecha; descripción, comercio y etiquetas van plegados, y si la descripción queda vacía se usa el nombre de la categoría. El monto se lee con `parseAmount` del dominio y viaja como texto. Se recuerda el último método de pago del navegador; sin método o con uno bimoneda hay que elegir la moneda, sin valor por defecto. Las transferencias piden el monto recibido cuando cambia la moneda. Borrar muestra «Deshacer» unos segundos en vez de pedir confirmación.
- ce439cd: Lista de transacciones en `/transactions`: los movimientos de un mes agrupados por día, con los totales por moneda de todo lo filtrado y «Cargar más» por cursor. Filtros por tipo (o solo transferencias), categoría y etiqueta, búsqueda y cambio de mes, todo en la URL y sin recargar la página. El mes por defecto es el de hoy en Lima. Las pantallas privadas se renderizan en cada petición, así que la navegación y las pantallas leen los feature flags al arrancar y no los del build. `catalog` sale de la navegación hasta que exista su pantalla.
- Updated dependencies [15cd2a4]
- Updated dependencies [0c7fd31]
- Updated dependencies [18e41ed]
- Updated dependencies [99cb32b]
- Updated dependencies [3f1d6ee]
- Updated dependencies [c3c7f6e]
- Updated dependencies [7341761]
- Updated dependencies [bae3856]
- Updated dependencies [7e40781]
- Updated dependencies [d0d4541]
- Updated dependencies [e4e1a1b]
- Updated dependencies [6043ec6]
  - @sol-a-sol/domain@0.4.0

## 0.3.0

### Minor Changes

- e802237: Cierra el hito **H2 — Identidad**: la plataforma ya tiene dueño. El módulo `identity` queda **encendido** (`FEATURE_IDENTITY=true`) con registro, inicio de sesión, sesión renovable, segundo factor con códigos de recuperación, tokens personales para el celular, límite de intentos y bitácora de seguridad.

  Este cambio agrega además lo que faltaba para darlo por cerrado: **`helmet`** con las cabeceras de seguridad (incluida una política de contenido cerrada entera, `default-src 'none'`, que es lo exacto para algo que sirve JSON) y **CORS restringido** a `WEB_ORIGIN`, con credenciales y nunca `*`, porque la sesión viaja en una cookie.

  El aislamiento por usuario pasa a estar probado **endpoint por endpoint**: sin sesión, con una sesión inventada y con la sesión de otra cuenta. Se documentan los controles de OWASP ASVS nivel 1 que cubre el proyecto y los que faltan.

  La navegación de la web **no** muestra identidad todavía: el mismo flag enciende la API y el menú, y la pantalla de `/identity` no existe. El manifest vuelve al registro cuando la haya.

### Patch Changes

- 7e07708: Andamiaje del módulo `identity`, el primero de negocio, con sus cinco capas, su manifest en la web y su flag `FEATURE_IDENTITY` apagado. Se agregan dos tablas: `personal_access_tokens`, para que un dispositivo use la API sin la contraseña (se guarda solo el hash, con scopes, expiración y revocación, y se borran con la cuenta), y `audit_logs`, la bitácora de seguridad. La bitácora va **sin clave foránea** a propósito: una entrada de auditoría es un hecho inmutable y debe sobrevivir al borrado de quien lo provocó, así que borrar una cuenta no borra la evidencia de lo que hizo. Todavía no hay lógica: la ficha del módulo recoge las reglas decididas para el hito.

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 41faf4f: Feature flags por módulo y navegación que se arma sola. En la API, `FeatureFlagsService` y el guard `@RequiresFeature` dejan integrar un módulo incompleto a `main` sin exponerlo: solo se activa con el valor exacto `true` en su variable (`FEATURE_BUDGETING`), y una ruta apagada responde 404 para no revelar que existe. En la web, cada funcionalidad declara un manifest (`id`, `título`, `ruta`, `icono` y flag) y la barra de secciones se construye leyendo el registro, así que un módulo nuevo aparece sin editar el layout.
- 0d35d9a: Cada versión publica ya sus imágenes de producción en GHCR (`ghcr.io/andrewsthephen23/sol-a-sol-api` y `…-web`), con las etiquetas `X.Y.Z` y `sha-<commit>`, enlazadas en las notas del GitHub Release. Son las mismas imágenes que construye `docker-compose.test.yml`, y no se sube ninguna hasta que pasan el bloqueo de Trivy y un smoke test que las arranca de verdad. Un push a `main` sin versión nueva no publica nada.

## 0.1.0

### Minor Changes

- e6c922b: Hito H0 — Cimientos: monorepo con TypeScript estricto y configuraciones compartidas; hooks de Git (commitlint, lint-staged, gitleaks); API NestJS con `/health` y `/health/ready`; web Next.js; Prisma con el modelo `User` y su primera migración; imágenes Docker multi-stage y Docker Compose; pipelines de CI y seguridad (CodeQL, gitleaks, pnpm audit, Trivy); SonarQube Cloud, plantillas, protección de `main` y ADRs 0001–0003.
