import { describe, expect, it, vi } from 'vitest';

import type { PurgeDiscardedCaptures } from '../application/inbox.js';
import { DiscardedCapturesPurgeJob } from './discarded-captures-purge.job.js';

function jobWith(run: () => Promise<number>) {
  const execute = vi.fn(run);
  const purge = { execute } as unknown as PurgeDiscardedCaptures;
  return { job: new DiscardedCapturesPurgeJob(purge), execute };
}

describe('DiscardedCapturesPurgeJob', () => {
  it('runs the purge', async () => {
    const { job, execute } = jobWith(() => Promise.resolve(3));

    await job.run();

    expect(execute).toHaveBeenCalledOnce();
  });

  it('does not let a failure through: it tries again the next day', async () => {
    const { job } = jobWith(() => Promise.reject(new Error('la base se cayó')));

    await expect(job.run()).resolves.toBeUndefined();
  });
});
