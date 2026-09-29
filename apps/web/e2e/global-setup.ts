import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer } from '@testcontainers/postgresql';

import { API_PORT, API_URL, INVITE_CODE_VAR, WEB_PORT, WEB_URL } from './support/environment';

/** La misma que usan Docker Compose y las pruebas de integración. */
const POSTGRES_IMAGE = 'postgres:18.6-alpine3.24';
const API_ROOT = fileURLToPath(new URL('../../api', import.meta.url));
const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const STARTUP_TIMEOUT_MS = 60_000;

// Las CLI se ejecutan con este mismo `node` y por su ruta, no buscándolas en el `PATH`: así no
// importa qué haya en él.
const PRISMA_CLI = createRequire(`${API_ROOT}package.json`).resolve('prisma/build/index.js');
const NEXT_CLI = createRequire(import.meta.url).resolve('next/dist/bin/next');

/**
 * Levanta lo que usan las pruebas y devuelve cómo apagarlo:
 *
 * 1. Un PostgreSQL efímero, con las migraciones versionadas (nunca `db push`).
 * 2. La API compilada (`dist/main.js`), con `identity`, `catalog` y `transactions` encendidos y
 *    el registro por invitación.
 * 3. La web compilada (`next start`), que reenvía `/api/*` a esa API.
 *
 * Los secretos se generan en cada corrida y no se escriben en ningún archivo.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  const inviteCode = randomBytes(12).toString('hex');
  process.env[INVITE_CODE_VAR] = inviteCode;

  const flags = {
    FEATURE_IDENTITY: 'true',
    FEATURE_CATALOG: 'true',
    FEATURE_TRANSACTIONS: 'true',
    FEATURE_BUDGETING: 'true',
    FEATURE_REPORTS: 'true',
  };
  const api = start('api', ['dist/main.js'], API_ROOT, {
    ...flags,
    PORT: String(API_PORT),
    DATABASE_URL: databaseUrl,
    REGISTRATION_MODE: 'invite',
    REGISTRATION_INVITE_CODE: inviteCode,
    AUTH_JWT_SECRET: randomBytes(48).toString('base64'),
    AUTH_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    WEB_ORIGIN: WEB_URL,
    // Cada prueba se registra y entra varias veces desde la misma IP: el tope de caudal no es lo
    // que se prueba aquí. El bloqueo por intentos fallidos sigue activo.
    RATE_LIMIT_PER_MINUTE: '100000',
    AUTH_RATE_LIMIT_PER_MINUTE: '100000',
    LOG_LEVEL: 'warn',
  });
  const web = start('web', [NEXT_CLI, 'start', '--port', String(WEB_PORT)], WEB_ROOT, {
    ...flags,
    API_URL,
  });

  const stop = async () => {
    for (const child of [web, api]) stopGroup(child);
    await container.stop();
  };

  try {
    await Promise.all([waitFor(`${API_URL}/health/ready`), waitFor(`${WEB_URL}/login`)]);
  } catch (error) {
    await stop();
    throw error;
  }

  return stop;
}

function start(
  name: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): ChildProcess {
  // Sin `--env-file`: el `.env` de desarrollo no se lee, así que la configuración es solo esta.
  // En su propio grupo de procesos (`detached`): `next start` deja hijos (`next-server`)
  // que no mueren con el padre, y al terminar se apaga el grupo entero.
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    detached: true,
  });
  child.stdout.on('data', (chunk: Buffer) => process.stdout.write(`[${name}] ${chunk.toString()}`));
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(`[${name}] ${chunk.toString()}`));

  return child;
}

function stopGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Ya había terminado.
  }
}

async function waitFor(url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer within ${String(STARTUP_TIMEOUT_MS / 1000)} s.`);
}
