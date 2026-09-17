import { Injectable } from '@nestjs/common';

/** Módulos de negocio de la fase 1. Cada uno se activa con su propia variable de entorno. */
export const FEATURE_MODULES = [
  'identity',
  'catalog',
  'transactions',
  'budgeting',
  'credit-cards',
  'goals',
  'reports',
  'capture',
] as const;

export type FeatureModule = (typeof FEATURE_MODULES)[number];

/** `credit-cards` → `FEATURE_CREDIT_CARDS`. */
export function featureEnvVar(module: FeatureModule): string {
  return `FEATURE_${module.replaceAll('-', '_').toUpperCase()}`;
}

/**
 * Un módulo está activo **solo** si su variable vale exactamente `'true'`.
 * Cualquier otro valor lo deja apagado: un error de tipeo nunca expone un módulo a medias.
 */
export function isFeatureEnabled(
  env: Record<string, string | undefined>,
  module: FeatureModule,
): boolean {
  return env[featureEnvVar(module)] === 'true';
}

@Injectable()
export class FeatureFlagsService {
  /** Se lee el entorno en cada consulta: así un cambio no obliga a reconstruir la inyección. */
  isEnabled(module: FeatureModule): boolean {
    return isFeatureEnabled(process.env, module);
  }

  enabledModules(): FeatureModule[] {
    return FEATURE_MODULES.filter((module) => this.isEnabled(module));
  }
}
