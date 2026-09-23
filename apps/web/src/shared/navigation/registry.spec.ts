import { describe, expect, it } from 'vitest';

import { type FeatureManifest } from './navigation';
import { featureManifests } from './registry';

// Todos los manifests, estén o no en la navegación (`identity` está fuera a propósito), para
// que un módulo nuevo quede cubierto sin tocar esta prueba. Con `eager` Vite devuelve los
// módulos ya cargados, pero los tipos que ve `tsc` solo describen la forma perezosa.
const manifestModules = import.meta.glob('@/features/*/manifest.ts', {
  eager: true,
}) as unknown as Record<string, Record<string, FeatureManifest>>;
const allManifests = Object.values(manifestModules).flatMap((module) => Object.values(module));

describe('feature registry', () => {
  it('does not repeat an id or a route in the navigation', () => {
    const ids = featureManifests.map((manifest) => manifest.id);
    const routes = featureManifests.map((manifest) => manifest.route);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  // La API lee la misma variable: si el nombre difiere, la web y la API se encienden por separado.
  it('names every feature flag FEATURE_<ID>, the variable the API reads', () => {
    const flagged = allManifests.filter((manifest) => manifest.flag !== undefined);

    expect(flagged.map((manifest) => manifest.id)).toEqual(
      expect.arrayContaining(['catalog', 'identity']),
    );
    for (const manifest of flagged) {
      expect(manifest.flag).toBe(`FEATURE_${manifest.id.toUpperCase().replaceAll('-', '_')}`);
    }
  });
});
