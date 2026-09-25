import {
  changePasswordRequestSchema,
  createCategoryRequestSchema,
  createPaymentMethodRequestSchema,
  createPersonalAccessTokenRequestSchema,
  createTransactionRequestSchema,
  currencySchema,
  CURSOR_MAX_LENGTH,
  SEARCH_MAX_LENGTH,
  TRANSACTIONS_DEFAULT_LIMIT,
  TRANSACTIONS_MAX_LIMIT,
  paymentMethodKindSchema,
  transactionSourceSchema,
  transactionTypeSchema,
  updateCategoryRequestSchema,
  updatePaymentMethodRequestSchema,
  updateTransactionRequestSchema,
  loginRequestSchema,
  problemDetailsSchema,
  PROBLEM_CONTENT_TYPE,
  registerRequestSchema,
  totpCodeRequestSchema,
} from '@sol-a-sol/contracts';
import { z, type ZodType } from 'zod';

import { API_PREFIX } from '../../app.setup.js';
import type { FeatureModule } from '../feature-flags/feature-flags.js';

/**
 * Documento OpenAPI 3.0 de la API, armado con los **mismos esquemas Zod** con los que valida.
 *
 * No se usa `@nestjs/swagger`: arrastraría unos 17 MB a la imagen de producción (sobre todo
 * `swagger-ui-dist`) para servir documentación. Generarlo aquí cuesta cero y, sobre todo,
 * garantiza que la descripción de un cuerpo no pueda separarse de lo que la API acepta de
 * verdad, porque son el mismo objeto. Una prueba comprueba además que toda ruta registrada
 * en Nest aparezca en el documento.
 */

/** OpenAPI 3.0 es anterior a JSON Schema 2020-12, así que Zod adapta su salida. */
function schemaOf(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' });
}

const PROBLEM_REF = { $ref: '#/components/schemas/ProblemDetails' };

function problem(description: string): Record<string, unknown> {
  return { description, content: { [PROBLEM_CONTENT_TYPE]: { schema: PROBLEM_REF } } };
}

function jsonBody(schema: ZodType): Record<string, unknown> {
  return { required: true, content: { 'application/json': { schema: schemaOf(schema) } } };
}

const ACCOUNT_SCHEMA = schemaOf(
  z.object({ id: z.uuid(), email: z.email(), createdAt: z.iso.datetime() }),
);

const TOTP_SETUP_SCHEMA = schemaOf(
  z.object({
    uri: z.string().describe('URI otpauth:// para escanear.'),
    secret: z.string().describe('El mismo secreto en base32, para escribirlo a mano.'),
  }),
);

const RECOVERY_CODES_SCHEMA = schemaOf(
  z.object({
    recoveryCodes: z
      .array(z.string())
      .describe('Diez códigos. Es la única vez que se pueden leer.'),
  }),
);

const ACCESS_TOKEN_SCHEMA = schemaOf(
  z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.int().describe('Segundos de vida del token.'),
  }),
);

const TOKEN_SUMMARY = z.object({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable().describe('Nulo si nunca se usó.'),
});

const TOKEN_LIST_SCHEMA = schemaOf(z.array(TOKEN_SUMMARY));

/** Lo que se cuenta tras cambiar la contraseña o activar el segundo factor (decisión 7). */
const SECURITY_CHANGE_NOTICE = z.object({
  otherSessionsClosed: z.int().describe('Sesiones de otros navegadores que se cerraron.'),
  personalAccessTokens: z
    .array(TOKEN_SUMMARY)
    .describe('Tokens personales que siguen valiendo: no se revocan, pero conviene revisarlos.'),
});

const SECURITY_CHANGE_SCHEMA = schemaOf(SECURITY_CHANGE_NOTICE);

const CONFIRMED_TOTP_SCHEMA = schemaOf(
  SECURITY_CHANGE_NOTICE.extend({
    recoveryCodes: z
      .array(z.string())
      .describe('Diez códigos. Es la única vez que se pueden leer.'),
  }),
);

const CREATED_TOKEN_SCHEMA = schemaOf(
  TOKEN_SUMMARY.extend({
    token: z
      .string()
      .describe('El token en claro (`sas_pat_…`). Es la única vez que se puede leer.'),
  }),
);

const PAYMENT_METHOD = z.object({
  id: z.uuid(),
  kind: paymentMethodKindSchema,
  alias: z.string(),
  institution: z.string().nullable().describe('Banco o entidad. Nulo en el efectivo.'),
  last4: z
    .string()
    .nullable()
    .describe('Últimos 4 dígitos. Nunca se guarda ni se devuelve nada más de una tarjeta.'),
  currency: currencySchema.nullable().describe('Nula = acepta soles y dólares (bimoneda).'),
  archivedAt: z.iso.datetime().nullable().describe('Nulo si está activo.'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const PAYMENT_METHOD_SCHEMA = schemaOf(PAYMENT_METHOD);
const PAYMENT_METHOD_LIST_SCHEMA = schemaOf(z.array(PAYMENT_METHOD));

const CATEGORY = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  name: z.string(),
  parentId: z.uuid().nullable().describe('Nulo en una categoría de primer nivel.'),
  color: z.string().describe('#RRGGBB'),
  icon: z.string().describe('Nombre del ícono en la web, en kebab-case.'),
  archivedAt: z.iso.datetime().nullable().describe('Nulo si está activa.'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const CATEGORY_SCHEMA = schemaOf(CATEGORY);
const CATEGORY_TREE_SCHEMA = schemaOf(
  z.array(CATEGORY.extend({ children: z.array(CATEGORY).describe('Sus subcategorías.') })),
);

const CATEGORY_ID_PARAMETER = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const PAYMENT_METHOD_RULES =
  'Una tarjeta de crédito lleva sus últimos 4 dígitos; una cuenta puede llevarlos; una ' +
  'billetera y el efectivo, no. Una cuenta o billetera lleva moneda; una tarjeta bimoneda y el ' +
  'efectivo pueden no llevarla. El efectivo no tiene banco. Un número más largo que 4 dígitos ' +
  'se rechaza, nunca se recorta.';

const TRANSACTION = z.object({
  id: z.uuid(),
  date: z.iso.date().describe('Día en que pasó, sin hora.'),
  type: transactionTypeSchema,
  categoryId: z.uuid(),
  amount: z
    .string()
    .describe(
      'String decimal con 2 decimales (`"25.90"`). Siempre positivo: el signo lo da `type`.',
    ),
  currency: currencySchema,
  description: z.string(),
  paymentMethodId: z.uuid().nullable().describe('Nulo si no se dijo con qué se pagó.'),
  merchant: z.string().nullable(),
  source: transactionSourceSchema.describe('De dónde llegó. No cambia al editar.'),
  captureId: z.uuid().nullable().describe('Captura del celular de la que salió (H7).'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const TRANSACTION_SCHEMA = schemaOf(TRANSACTION);

const decimal = (description: string) => z.string().describe(`String decimal. ${description}`);

const TRANSACTION_LIST_SCHEMA = schemaOf(
  z.object({
    items: z.array(TRANSACTION).describe('La página, de la fecha más reciente a la más antigua.'),
    nextCursor: z
      .string()
      .nullable()
      .describe('Se manda tal cual en `?cursor=` para la página siguiente. Nulo si no hay más.'),
    totals: z
      .array(
        z.object({
          currency: currencySchema,
          income: decimal('Ingresos.'),
          expense: decimal('Gasto fijo + variable.'),
          saving: decimal('Ahorro + inversión.'),
          debt: decimal('Pagos de deuda.'),
          balance: decimal('Ingresos menos todo lo demás. Puede ser negativo.'),
        }),
      )
      .describe(
        'De **todo** lo filtrado, no solo de esta página. Una entrada por moneda con ' +
          'movimientos, primero soles; nunca se convierte.',
      ),
  }),
);

const TRANSACTION_ID_PARAMETER = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

function queryParameter(
  name: string,
  schema: Record<string, unknown>,
  description?: string,
): Record<string, unknown> {
  return {
    name,
    in: 'query',
    required: false,
    schema,
    ...(description === undefined ? {} : { description }),
  };
}

function transactionResponse(description: string): Record<string, unknown> {
  return { description, content: { 'application/json': { schema: TRANSACTION_SCHEMA } } };
}

const TRANSACTION_RULES =
  'El monto viaja como string decimal, siempre positivo y con hasta 2 decimales: un tercer ' +
  'decimal se rechaza, no se redondea. La fecha es de hoy o anterior, en la hora de Lima. La ' +
  'categoría es del mismo tipo que la transacción y no está archivada; puede ser una categoría ' +
  'de primer nivel o una subcategoría. El método de pago es opcional; si se indica, no puede ' +
  'estar archivado. Sin `currency` se usa la del método de pago; si este acepta las dos ' +
  'monedas, o no hay método, se exige. Nunca se convierte.';

const ALWAYS_ON_PATHS: Record<string, unknown> = {
  [`/${API_PREFIX}/openapi.json`]: {
    get: {
      tags: ['meta'],
      summary: 'Devuelve este mismo documento.',
      description:
        'Solo describe lo que está encendido: las rutas de un módulo con su feature flag ' +
        'apagado no aparecen, porque documentarlas confirmaría justo lo que su 404 oculta.',
      responses: {
        '200': {
          description: 'Documento OpenAPI 3.0.',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
      },
    },
  },
};

const HEALTH_PATHS: Record<string, unknown> = {
  '/health': {
    get: {
      tags: ['health'],
      summary: 'Comprueba que el proceso responde.',
      description: 'Fuera del prefijo de la API: lo consultan Docker y el balanceador.',
      responses: { '200': { description: 'El proceso está vivo.' } },
    },
  },
  '/health/ready': {
    get: {
      tags: ['health'],
      summary: 'Comprueba que la API puede atender peticiones.',
      responses: {
        '200': { description: 'Listo: la base de datos responde.' },
        '503': problem('Alguna dependencia no responde.'),
      },
    },
  },
};

function identityPaths(): Record<string, unknown> {
  return {
    [`/${API_PREFIX}/auth/register`]: {
      post: {
        tags: ['identity'],
        summary: 'Crea una cuenta.',
        description:
          'Quién puede registrarse lo decide `REGISTRATION_MODE`. Cuando no está permitido ' +
          'responde 404, igual que una ruta que no existe.',
        requestBody: jsonBody(registerRequestSchema),
        responses: {
          '201': {
            description: 'Cuenta creada. Nunca incluye el hash ni el secreto TOTP.',
            content: { 'application/json': { schema: ACCOUNT_SCHEMA } },
          },
          '404': problem('El registro no está permitido, o el módulo está apagado.'),
          '409': problem('Ya existe una cuenta con ese correo.'),
          '422': problem('El cuerpo no tiene la forma esperada, o la contraseña es débil.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/login`]: {
      post: {
        tags: ['identity'],
        summary: 'Inicia sesión y devuelve un token de acceso.',
        description:
          'Un correo desconocido y una contraseña equivocada responden lo mismo, y tardan lo ' +
          'mismo, para no revelar qué correos tienen cuenta.',
        requestBody: jsonBody(loginRequestSchema),
        responses: {
          '200': {
            description: 'Token de acceso, válido 15 minutos.',
            content: { 'application/json': { schema: ACCESS_TOKEN_SCHEMA } },
          },
          '401': problem('El correo o la contraseña no corresponden.'),
          '404': problem('El módulo está apagado.'),
          '422': problem('El cuerpo no tiene la forma esperada.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/refresh`]: {
      post: {
        tags: ['identity'],
        summary: 'Renueva la sesión a partir de la cookie de refresco.',
        description:
          'El refresco viaja solo en la cookie, no en el cuerpo. Cada uso emite uno nuevo e ' +
          'invalida el anterior; si llega uno ya canjeado se cierran todas las sesiones de la ' +
          'cuenta, porque es la señal de que alguien lo copió.',
        responses: {
          '200': {
            description: 'Sesión renovada. La cookie se reemplaza por una nueva.',
            content: { 'application/json': { schema: ACCESS_TOKEN_SCHEMA } },
          },
          '401': problem('No hay cookie, o el refresco no vale: caducó, se revocó o ya se usó.'),
          '404': problem('El módulo está apagado.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/setup`]: {
      post: {
        tags: ['identity'],
        summary: 'Empieza a activar el segundo factor.',
        description:
          'Devuelve **una sola vez** el `otpauth://` que escanean Google Authenticator, Aegis, ' +
          '1Password o Bitwarden. El segundo factor no queda activo hasta confirmarlo con un código.',
        security: [{ accessToken: [] }],
        responses: {
          '200': {
            description: 'Secreto y URI. No se pueden volver a consultar.',
            content: { 'application/json': { schema: TOTP_SETUP_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: la cuenta solo se toca desde una sesión.'),
          '409': problem('El segundo factor ya está activo; hay que desactivarlo primero.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/verify`]: {
      post: {
        tags: ['identity'],
        summary: 'Confirma el segundo factor y devuelve los códigos de recuperación.',
        description:
          'Los códigos se muestran **una sola vez**: después solo se guarda su hash. Son la ' +
          'salida cuando se pierde el teléfono. Cierra las sesiones de los demás navegadores ' +
          '(se abrieron sin segundo factor) y conserva la de la cookie; los tokens personales ' +
          'siguen valiendo y se listan para ofrecer revocarlos.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(totpCodeRequestSchema),
        responses: {
          '200': {
            description: 'Segundo factor activo, con sus códigos de recuperación.',
            content: { 'application/json': { schema: CONFIRMED_TOTP_SCHEMA } },
          },
          '401': problem('Falta el token de acceso, o el código no vale.'),
          '403': problem('Llegó un token personal: la cuenta solo se toca desde una sesión.'),
          '409': problem('No hay ninguna activación en marcha, o ya estaba activo.'),
          '422': problem('El código no son seis dígitos.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/recovery-codes`]: {
      post: {
        tags: ['identity'],
        summary: 'Rehace los códigos de recuperación.',
        description:
          'Invalida los anteriores y devuelve diez nuevos, **una sola vez**. Exige un código ' +
          'de la aplicación de autenticación.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(totpCodeRequestSchema),
        responses: {
          '200': {
            description: 'Códigos nuevos. Los anteriores dejan de valer.',
            content: { 'application/json': { schema: RECOVERY_CODES_SCHEMA } },
          },
          '401': problem('Falta el token de acceso, o el código no vale.'),
          '403': problem('Llegó un token personal: la cuenta solo se toca desde una sesión.'),
          '409': problem('La cuenta no tiene segundo factor activo.'),
          '422': problem('El código no son seis dígitos.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/disable`]: {
      post: {
        tags: ['identity'],
        summary: 'Desactiva el segundo factor, y olvida el secreto y los códigos.',
        description: 'Exige un código válido: quitar el segundo factor es una rebaja de seguridad.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(totpCodeRequestSchema),
        responses: {
          '204': { description: 'Segundo factor desactivado.' },
          '401': problem('Falta el token de acceso, o el código no vale.'),
          '403': problem('Llegó un token personal: la cuenta solo se toca desde una sesión.'),
          '409': problem('La cuenta no tiene segundo factor activo.'),
          '422': problem('El código no son seis dígitos.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/password`]: {
      post: {
        tags: ['identity'],
        summary: 'Cambia la contraseña.',
        description:
          'Pide la actual. Cierra las sesiones de los demás navegadores y conserva la de la ' +
          'cookie. Los tokens personales **no se revocan**, para no romper en silencio la ' +
          'captura desde el celular: la respuesta los lista para ofrecer revocarlos.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(changePasswordRequestSchema),
        responses: {
          '200': {
            description: 'Contraseña cambiada.',
            content: { 'application/json': { schema: SECURITY_CHANGE_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem(
            'La contraseña actual no corresponde, o llegó un token personal: la cuenta solo se ' +
              'toca desde una sesión.',
          ),
          '422': problem('El cuerpo no tiene la forma esperada, o la nueva contraseña es débil.'),
        },
      },
    },
    [`/${API_PREFIX}/tokens`]: {
      get: {
        tags: ['identity'],
        summary: 'Lista los tokens personales vigentes, sin su valor.',
        description:
          'Incluye los caducados, para que se vea por qué un dispositivo dejó de funcionar; ' +
          'los revocados no aparecen.',
        security: [{ accessToken: [] }],
        responses: {
          '200': {
            description: 'Tokens de la cuenta, del más nuevo al más viejo.',
            content: { 'application/json': { schema: TOKEN_LIST_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: los tokens solo se gestionan desde una sesión.'),
        },
      },
      post: {
        tags: ['identity'],
        summary: 'Crea un token personal para un dispositivo.',
        description:
          'El token se muestra **una sola vez**; en la base solo queda su hash. Caduca entre ' +
          '1 y 365 días después, 90 si no se indica. Hoy el único scope es `captures:write`.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(createPersonalAccessTokenRequestSchema),
        responses: {
          '201': {
            description: 'Token creado, con su valor en claro.',
            content: { 'application/json': { schema: CREATED_TOKEN_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: los tokens solo se gestionan desde una sesión.'),
          '422': problem(
            'El cuerpo no tiene la forma esperada, un scope no existe o la duración no vale.',
          ),
        },
      },
    },
    [`/${API_PREFIX}/tokens/{id}`]: {
      delete: {
        tags: ['identity'],
        summary: 'Revoca un token personal.',
        description: 'Deja de valer en el acto. El dispositivo que lo usaba recibirá 401.',
        security: [{ accessToken: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Token revocado.' },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: los tokens solo se gestionan desde una sesión.'),
          '404': problem('No existe, ya estaba revocado o es de otra cuenta.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/logout`]: {
      post: {
        tags: ['identity'],
        summary: 'Cierra la sesión actual y borra la cookie.',
        description:
          'Responde 204 valga la cookie o no: quien cierra sesión quiere irse, y un error ' +
          'delataría si un token que alguien probó existe. No toca las demás sesiones.',
        responses: {
          '204': { description: 'Sesión cerrada, o no había ninguna que cerrar.' },
          '404': problem('El módulo está apagado.'),
        },
      },
    },
  };
}

function catalogPaths(): Record<string, unknown> {
  return {
    [`/${API_PREFIX}/categories`]: {
      get: {
        tags: ['catalog'],
        summary: 'Lista las categorías de la cuenta, con sus subcategorías anidadas.',
        description:
          'Ordenadas por nombre. Sin las archivadas, salvo con `includeArchived=true`; `type` ' +
          'filtra por tipo de transacción.',
        security: [{ accessToken: [] }],
        parameters: [
          {
            name: 'type',
            in: 'query',
            required: false,
            schema: schemaOf(transactionTypeSchema),
          },
          {
            name: 'includeArchived',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
        ],
        responses: {
          '200': {
            description: 'Categorías de primer nivel, cada una con sus subcategorías.',
            content: { 'application/json': { schema: CATEGORY_TREE_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '422': problem('`type` o `includeArchived` no tienen un valor válido.'),
        },
      },
      post: {
        tags: ['catalog'],
        summary: 'Crea una categoría o, con `parentId`, una subcategoría.',
        description:
          'Un solo nivel: una subcategoría no puede ser madre. Una categoría de primer nivel ' +
          'necesita `type`; una subcategoría hereda el de su madre, y también su color e ícono ' +
          'si no se mandan. El nombre no se repite entre hermanas del mismo tipo, sin distinguir ' +
          'mayúsculas ni acentos (la ñ sí cuenta).',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(createCategoryRequestSchema),
        responses: {
          '201': {
            description: 'Categoría creada.',
            content: { 'application/json': { schema: CATEGORY_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '404': problem('La madre no existe o es de otra cuenta.'),
          '409': problem('Una hermana ya tiene ese nombre (quizá archivada: se restaura).'),
          '422': problem(
            'El cuerpo no tiene la forma esperada, falta el tipo, el tipo no es el de la madre, ' +
              'la madre es una subcategoría o está archivada, o el color no es #RRGGBB.',
          ),
        },
      },
    },
    [`/${API_PREFIX}/categories/{id}`]: {
      patch: {
        tags: ['catalog'],
        summary: 'Renombra, cambia color o ícono, archiva o restaura una categoría.',
        description:
          'El tipo y la madre no se cambian. `archived: true` archiva la categoría y sus hijas; ' +
          '`false` la restaura junto con las hijas que se archivaron con ella. Una subcategoría ' +
          'no se restaura mientras su madre siga archivada. No hay `DELETE`.',
        security: [{ accessToken: [] }],
        parameters: [CATEGORY_ID_PARAMETER],
        requestBody: jsonBody(updateCategoryRequestSchema),
        responses: {
          '200': {
            description: 'Categoría como quedó.',
            content: { 'application/json': { schema: CATEGORY_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '404': problem('No existe o es de otra cuenta.'),
          '409': problem('Una hermana ya tiene ese nombre.'),
          '422': problem(
            'El cuerpo está vacío, intenta cambiar el tipo o la madre, el color no es #RRGGBB, ' +
              'o la madre de la subcategoría sigue archivada.',
          ),
        },
      },
    },
    [`/${API_PREFIX}/payment-methods`]: {
      get: {
        tags: ['catalog'],
        summary: 'Lista los métodos de pago de la cuenta, ordenados por alias.',
        description: 'Sin los archivados, salvo con `includeArchived=true`.',
        security: [{ accessToken: [] }],
        parameters: [
          {
            name: 'includeArchived',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['true', 'false'], default: 'false' },
          },
        ],
        responses: {
          '200': {
            description: 'Métodos de pago de la cuenta.',
            content: { 'application/json': { schema: PAYMENT_METHOD_LIST_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '422': problem('`includeArchived` no es `true` ni `false`.'),
        },
      },
      post: {
        tags: ['catalog'],
        summary: 'Registra un método de pago: cuenta, billetera, tarjeta o efectivo.',
        description: PAYMENT_METHOD_RULES,
        security: [{ accessToken: [] }],
        requestBody: jsonBody(createPaymentMethodRequestSchema),
        responses: {
          '201': {
            description: 'Método de pago creado.',
            content: { 'application/json': { schema: PAYMENT_METHOD_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '409': problem('Ya existe un método con ese alias (quizá archivado: se restaura).'),
          '422': problem(
            'El cuerpo no tiene la forma esperada, trae un campo desconocido o rompe una regla ' +
              'de su tipo.',
          ),
        },
      },
    },
    [`/${API_PREFIX}/payment-methods/{id}`]: {
      patch: {
        tags: ['catalog'],
        summary: 'Corrige, archiva o restaura un método de pago.',
        description:
          'Se puede cambiar todo menos el tipo. `archived: true` lo archiva (deja de ofrecerse ' +
          'al registrar, pero sigue en lo ya registrado) y `false` lo restaura. No hay `DELETE`. ' +
          PAYMENT_METHOD_RULES,
        security: [{ accessToken: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: jsonBody(updatePaymentMethodRequestSchema),
        responses: {
          '200': {
            description: 'Método de pago como quedó.',
            content: { 'application/json': { schema: PAYMENT_METHOD_SCHEMA } },
          },
          '401': problem('Falta el token de acceso o no vale.'),
          '403': problem('Llegó un token personal: el catálogo solo se gestiona desde una sesión.'),
          '404': problem('No existe o es de otra cuenta.'),
          '409': problem('Ya existe otro método con ese alias.'),
          '422': problem(
            'El cuerpo está vacío, intenta cambiar el tipo o deja el método rompiendo una regla ' +
              'de su tipo.',
          ),
        },
      },
    },
  };
}

function transactionsPaths(): Record<string, unknown> {
  const forbidden = problem(
    'Llegó un token personal: las transacciones solo se gestionan desde una sesión.',
  );
  const unauthorized = problem('Falta el token de acceso o no vale.');
  const notFound = problem('No existe, es de otra cuenta o está borrada.');

  return {
    [`/${API_PREFIX}/transactions`]: {
      get: {
        tags: ['transactions'],
        summary: 'Lista las transacciones, con filtros, búsqueda y totales.',
        description:
          'De la fecha más reciente a la más antigua y, en el mismo día, de la última ' +
          'registrada a la primera. Sin fechas trae todo. Las borradas no aparecen; las de ' +
          'categorías o métodos archivados, sí. Paginación por cursor: lo que se registre o se ' +
          'borre entre dos páginas no hace repetir ni saltar filas.',
        security: [{ accessToken: [] }],
        parameters: [
          queryParameter(
            'month',
            { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
            'Un mes, `YYYY-MM`. No va junto con `from` o `to`.',
          ),
          queryParameter('from', { type: 'string', format: 'date' }, 'Desde este día, inclusive.'),
          queryParameter('to', { type: 'string', format: 'date' }, 'Hasta este día, inclusive.'),
          queryParameter('type', schemaOf(transactionTypeSchema)),
          queryParameter(
            'categoryId',
            { type: 'string', format: 'uuid' },
            'Trae también sus subcategorías. Una categoría ajena no trae nada.',
          ),
          queryParameter('paymentMethodId', { type: 'string', format: 'uuid' }),
          queryParameter('currency', schemaOf(currencySchema)),
          queryParameter(
            'q',
            { type: 'string', maxLength: SEARCH_MAX_LENGTH },
            'Texto a buscar en la descripción o el comercio, sin distinguir mayúsculas ni tildes.',
          ),
          queryParameter(
            'cursor',
            { type: 'string', maxLength: CURSOR_MAX_LENGTH },
            'El `nextCursor` de la página anterior, tal cual. Su contenido no es contrato.',
          ),
          queryParameter(
            'limit',
            { type: 'integer', minimum: 1, default: TRANSACTIONS_DEFAULT_LIMIT },
            `Filas por página. Más de ${String(TRANSACTIONS_MAX_LIMIT)} se recorta a ${String(TRANSACTIONS_MAX_LIMIT)}.`,
          ),
        ],
        responses: {
          '200': {
            description: 'Una página y los totales de lo filtrado.',
            content: { 'application/json': { schema: TRANSACTION_LIST_SCHEMA } },
          },
          '401': unauthorized,
          '403': forbidden,
          '422': problem(
            'Un filtro no tiene un valor válido, se mandaron `month` y `from`/`to` a la vez, ' +
              '`from` es posterior a `to`, o el cursor no es uno que haya dado la API ' +
              '(`INVALID_CURSOR`).',
          ),
        },
      },
      post: {
        tags: ['transactions'],
        summary: 'Registra una transacción.',
        description: `Queda con \`source: MANUAL\`. ${TRANSACTION_RULES}`,
        security: [{ accessToken: [] }],
        requestBody: jsonBody(createTransactionRequestSchema),
        responses: {
          '201': transactionResponse('Transacción registrada.'),
          '401': unauthorized,
          '403': forbidden,
          '404': problem('La categoría o el método de pago no existen o son de otra cuenta.'),
          '422': problem(
            'El cuerpo no tiene la forma esperada, o rompe una regla: monto no positivo o con ' +
              'más de 2 decimales, fecha futura, categoría de otro tipo o archivada, método ' +
              'archivado, o falta la moneda.',
          ),
        },
      },
    },
    [`/${API_PREFIX}/transactions/{id}`]: {
      get: {
        tags: ['transactions'],
        summary: 'Devuelve una transacción.',
        security: [{ accessToken: [] }],
        parameters: [TRANSACTION_ID_PARAMETER],
        responses: {
          '200': transactionResponse('La transacción.'),
          '401': unauthorized,
          '403': forbidden,
          '404': notFound,
        },
      },
      patch: {
        tags: ['transactions'],
        summary: 'Corrige una transacción, también de meses pasados.',
        description:
          'Se manda solo lo que cambia. El origen (`source`) no se corrige. El tipo se cambia ' +
          'junto con una categoría de ese tipo. Sin `currency` la moneda no cambia, aunque cambie ' +
          'el método de pago. Una categoría o un método archivados que la transacción ya tenía ' +
          'siguen valiendo; elegirlos ahora, no. Una fecha nueva no puede ser futura.',
        security: [{ accessToken: [] }],
        parameters: [TRANSACTION_ID_PARAMETER],
        requestBody: jsonBody(updateTransactionRequestSchema),
        responses: {
          '200': transactionResponse('La transacción como quedó.'),
          '401': unauthorized,
          '403': forbidden,
          '404': problem(
            'La transacción no existe, es de otra cuenta o está borrada; o la categoría o el ' +
              'método elegidos no existen o son de otra cuenta.',
          ),
          '422': problem(
            'El cuerpo está vacío, trae `source` u otro campo desconocido, o la transacción ' +
              'quedaría rompiendo una regla.',
          ),
        },
      },
      delete: {
        tags: ['transactions'],
        summary: 'Borra una transacción (borrado lógico).',
        description:
          'Deja de aparecer, pero la fila queda para la auditoría y se puede restaurar sin plazo.',
        security: [{ accessToken: [] }],
        parameters: [TRANSACTION_ID_PARAMETER],
        responses: {
          '204': { description: 'Borrada.' },
          '401': unauthorized,
          '403': forbidden,
          '404': problem('No existe, es de otra cuenta o ya estaba borrada.'),
        },
      },
    },
    [`/${API_PREFIX}/transactions/{id}/restore`]: {
      post: {
        tags: ['transactions'],
        summary: 'Deshace el borrado de una transacción.',
        description:
          'Sin plazo: el aviso de «Deshacer» de unos segundos es cosa de la interfaz. Con una ' +
          'transacción que no está borrada, la devuelve tal cual y no hace nada más.',
        security: [{ accessToken: [] }],
        parameters: [TRANSACTION_ID_PARAMETER],
        responses: {
          '200': transactionResponse('La transacción, otra vez vigente.'),
          '401': unauthorized,
          '403': forbidden,
          '404': problem('No existe o es de otra cuenta.'),
        },
      },
    },
  };
}

/** Rutas que aporta cada módulo de negocio, para omitirlas cuando su flag está apagado. */
const PATHS_BY_MODULE: Partial<Record<FeatureModule, () => Record<string, unknown>>> = {
  identity: identityPaths,
  catalog: catalogPaths,
  transactions: transactionsPaths,
};

export interface OpenApiOptions {
  version: string;
  isFeatureEnabled: (module: FeatureModule) => boolean;
}

export function buildOpenApiDocument({
  version,
  isFeatureEnabled,
}: OpenApiOptions): Record<string, unknown> {
  // Un módulo apagado no aparece en el documento. Si apareciera, la documentación diría que
  // existe justo lo que el 404 se esfuerza en no confirmar.
  const modulePaths = Object.entries(PATHS_BY_MODULE)
    .filter(([module]) => isFeatureEnabled(module as FeatureModule))
    .flatMap(([, paths]) => Object.entries(paths()));

  return {
    openapi: '3.0.3',
    info: {
      title: 'Sol a Sol',
      version,
      description:
        'API de la plataforma personal de finanzas. Los montos viajan como string decimal.',
    },
    paths: { ...ALWAYS_ON_PATHS, ...HEALTH_PATHS, ...Object.fromEntries(modulePaths) },
    components: {
      schemas: { ProblemDetails: schemaOf(problemDetailsSchema) },
      securitySchemes: {
        accessToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        personalAccessToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'sas_pat_…',
          description:
            'Token personal de un dispositivo. Solo vale en las rutas que lo aceptan y con el ' +
            'scope que piden; en las demás responde 403.',
        },
      },
    },
  };
}
