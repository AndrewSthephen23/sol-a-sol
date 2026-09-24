import { describe, expect, it } from 'vitest';

import { FakeUserRepository } from '../ports/user-repository.fake.js';
import { ListAccountIds } from './list-account-ids.js';

describe('ListAccountIds', () => {
  it('returns the ids of every account', async () => {
    const users = new FakeUserRepository({ ids: ['ana', 'bruno'] });

    await expect(new ListAccountIds(users).execute()).resolves.toEqual(['ana', 'bruno']);
  });
});
