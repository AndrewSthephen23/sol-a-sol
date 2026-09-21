/**
 * Quién puede crear una cuenta.
 *
 * - `closed`: solo la primera persona, que queda como dueña de la plataforma. Después, nadie.
 * - `invite`: quien traiga el código de invitación configurado.
 * - `open`: cualquiera.
 */
export const REGISTRATION_MODES = ['closed', 'invite', 'open'] as const;

export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/**
 * Lee el modo de una variable de entorno. Ante cualquier duda, **cierra**: igual que con los
 * feature flags, un valor mal escrito no puede acabar abriendo el registro a internet.
 */
export function toRegistrationMode(value: string | undefined): RegistrationMode {
  return REGISTRATION_MODES.find((mode) => mode === value) ?? 'closed';
}

export interface RegistrationAttempt {
  mode: RegistrationMode;
  /** Si ya existe alguna cuenta. En modo `closed` es lo único que decide. */
  hasAnyUser: boolean;
  /** Código que trae quien intenta registrarse. */
  providedInvite?: string;
  /** Código configurado en el entorno. Sin él, el modo `invite` no deja pasar a nadie. */
  expectedInvite?: string;
}

export function isRegistrationAllowed({
  mode,
  hasAnyUser,
  providedInvite,
  expectedInvite,
}: RegistrationAttempt): boolean {
  switch (mode) {
    case 'open':
      return true;
    case 'closed':
      return !hasAnyUser;
    case 'invite':
      return matchesInvite(providedInvite, expectedInvite);
  }
}

/**
 * Compara el código en **tiempo constante**: una comparación normal se detiene en el primer
 * carácter distinto, y medir esa diferencia permite adivinar el código carácter a carácter.
 *
 * Un código vacío o sin configurar no deja pasar a nadie: olvidar la variable de entorno no
 * puede convertirse en "cualquiera entra con el código vacío".
 */
function matchesInvite(provided: string | undefined, expected: string | undefined): boolean {
  if (expected === undefined || expected === '') return false;
  if (provided === undefined) return false;

  // Se comparan las longitudes al final, y no antes, para que el trabajo no dependa de ellas.
  let differences = provided.length ^ expected.length;

  for (let index = 0; index < expected.length; index++) {
    differences |= expected.charCodeAt(index) ^ (provided.charCodeAt(index % provided.length) || 0);
  }

  return differences === 0;
}
