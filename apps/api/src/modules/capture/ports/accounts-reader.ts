/**
 * Los ids de todas las cuentas, para el borrado diario de las descartadas: así el repositorio
 * nunca consulta sin `userId`. Lo cumple `ListAccountIds`, de la API pública de `identity`.
 */
export interface CaptureAccountsReader {
  execute(): Promise<string[]>;
}

export const CAPTURE_ACCOUNTS_READER = Symbol('CaptureAccountsReader');

/** Qué módulos están encendidos. Lo cumple `FeatureFlagsService`. */
export interface CaptureFeatureFlags {
  isEnabled(module: 'capture'): boolean;
}

export const CAPTURE_FEATURE_FLAGS = Symbol('CaptureFeatureFlags');
