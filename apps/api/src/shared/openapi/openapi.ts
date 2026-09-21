import {
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

const ACCESS_TOKEN_SCHEMA = schemaOf(
  z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.int().describe('Segundos de vida del token.'),
  }),
);

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
          '409': problem('El segundo factor ya está activo; hay que desactivarlo primero.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/verify`]: {
      post: {
        tags: ['identity'],
        summary: 'Confirma el segundo factor con un código y lo deja activo.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(totpCodeRequestSchema),
        responses: {
          '204': { description: 'Segundo factor activo.' },
          '401': problem('Falta el token de acceso, o el código no vale.'),
          '409': problem('No hay ninguna activación en marcha, o ya estaba activo.'),
          '422': problem('El código no son seis dígitos.'),
        },
      },
    },
    [`/${API_PREFIX}/auth/2fa/disable`]: {
      post: {
        tags: ['identity'],
        summary: 'Desactiva el segundo factor y olvida el secreto.',
        description: 'Exige un código válido: quitar el segundo factor es una rebaja de seguridad.',
        security: [{ accessToken: [] }],
        requestBody: jsonBody(totpCodeRequestSchema),
        responses: {
          '204': { description: 'Segundo factor desactivado.' },
          '401': problem('Falta el token de acceso, o el código no vale.'),
          '409': problem('La cuenta no tiene segundo factor activo.'),
          '422': problem('El código no son seis dígitos.'),
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

/** Rutas que aporta cada módulo de negocio, para omitirlas cuando su flag está apagado. */
const PATHS_BY_MODULE: Partial<Record<FeatureModule, () => Record<string, unknown>>> = {
  identity: identityPaths,
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
      },
    },
  };
}
