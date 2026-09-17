/**
 * Un módulo está activo solo si su variable vale exactamente `'true'`, igual que en la API.
 * Se lee en el servidor: los flags no viajan al navegador.
 */
export function isFeatureEnabled(flag: string): boolean {
  return process.env[flag] === 'true';
}
