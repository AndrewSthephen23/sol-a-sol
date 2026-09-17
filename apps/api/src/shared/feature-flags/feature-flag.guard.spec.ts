import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FeatureFlagGuard, RequiresFeature } from './feature-flag.guard.js';
import { type FeatureModule, FeatureFlagsService } from './feature-flags.js';

class FakeFeatureFlags {
  constructor(private readonly enabled: readonly FeatureModule[]) {}

  isEnabled(module: FeatureModule): boolean {
    return this.enabled.includes(module);
  }
}

async function createGuard(enabled: readonly FeatureModule[]): Promise<FeatureFlagGuard> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FeatureFlagGuard,
      { provide: FeatureFlagsService, useValue: new FakeFeatureFlags(enabled) },
    ],
  }).compile();

  return moduleRef.get(FeatureFlagGuard);
}

class FakeController {
  handle(): void {
    // Un controlador cualquiera: el guard solo lee su metadata.
  }
}

function contextFor(handler: () => void): Parameters<FeatureFlagGuard['canActivate']>[0] {
  return {
    getHandler: () => handler,
    getClass: () => FakeController,
  } as unknown as Parameters<FeatureFlagGuard['canActivate']>[0];
}

describe('FeatureFlagGuard', () => {
  it('allows a route without the decorator', async () => {
    const guard = await createGuard([]);
    const plainHandler = (): void => undefined;

    expect(guard.canActivate(contextFor(plainHandler))).toBe(true);
  });

  it('allows the route when its module is enabled', async () => {
    const guard = await createGuard(['budgeting']);
    const handler = (): void => undefined;
    RequiresFeature('budgeting')(handler);

    expect(guard.canActivate(contextFor(handler))).toBe(true);
  });

  it('answers 404 when the module is disabled, so it does not reveal that it exists', async () => {
    const guard = await createGuard([]);
    const handler = (): void => undefined;
    RequiresFeature('budgeting')(handler);

    expect(() => guard.canActivate(contextFor(handler))).toThrow(NotFoundException);
  });
});
