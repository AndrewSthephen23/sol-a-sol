/** Nombre de módulo: kebab-case, empieza por letra (`credit-cards`). */
const MODULE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const MAX_NAME_LENGTH = 40;

export class InvalidModuleNameError extends Error {
  constructor(readonly value: unknown) {
    super(
      `Nombre de módulo inválido: ${JSON.stringify(value)}. Usa kebab-case en minúsculas, ` +
        `empezando por letra y con un máximo de ${String(MAX_NAME_LENGTH)} caracteres (ej.: credit-cards).`,
    );
    this.name = 'InvalidModuleNameError';
  }
}

export interface ModuleNames {
  /** `credit-cards` */
  name: string;
  /** `FEATURE_CREDIT_CARDS` */
  envVar: string;
  /** `CreditCards` */
  className: string;
  /** `creditCardsManifest` */
  manifestName: string;
  /** `Credit cards`: título sugerido si no se indica uno. */
  defaultTitle: string;
}

export function moduleNames(name: string): ModuleNames {
  if (
    typeof name !== 'string' ||
    name.length > MAX_NAME_LENGTH ||
    !MODULE_NAME_PATTERN.test(name)
  ) {
    throw new InvalidModuleNameError(name);
  }
  const segments = name.split('-');
  const className = segments.map(capitalize).join('');

  return {
    name,
    envVar: `FEATURE_${name.replaceAll('-', '_').toUpperCase()}`,
    className,
    manifestName: `${className.charAt(0).toLowerCase()}${className.slice(1)}Manifest`,
    defaultTitle: capitalize(segments.join(' ')),
  };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
