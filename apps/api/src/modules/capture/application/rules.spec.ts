import { ArchivedCategoryError, LocalDate } from '@sol-a-sol/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CaptureCategoryNotFoundError,
  CategorizationRuleNotFoundError,
  CategorizationRulePatternTakenError,
} from '../domain/errors.js';
import type { NewCapture } from '../ports/capture-repository.js';
import { FakeCaptureRepository } from '../ports/capture-repository.fake.js';
import { FakeCaptureCatalogReader } from '../ports/catalog-reader.fake.js';
import { FakeCategorizationRuleRepository } from '../ports/categorization-rule-repository.fake.js';
import {
  CreateCategorizationRule,
  DeleteCategorizationRule,
  FollowCategoryMerge,
  ListCategorizationRules,
  UpdateCategorizationRule,
} from './rules.js';

const ANA = 'user-ana';
const BRUNO = 'user-bruno';

let keys = 0;

function pending(extra: Partial<NewCapture> = {}): NewCapture {
  keys += 1;
  return {
    source: 'ANDROID_AUTOMATION',
    status: 'PENDING',
    type: 'VARIABLE_EXPENSE',
    occurredAt: new Date('2026-10-03T16:30:00.000Z'),
    businessDate: LocalDate.parse('2026-10-03'),
    amount: { value: '25.90', currency: 'PEN' },
    merchant: 'TAMBO LARCO',
    cardLast4: null,
    description: null,
    categoryId: null,
    paymentMethodId: null,
    warnings: [],
    rawPayload: { source: 'ANDROID_AUTOMATION' },
    idempotencyKey: `clave-${String(keys)}`,
    ...extra,
  };
}

describe('categorization rules', () => {
  let rules: FakeCategorizationRuleRepository;
  let captures: FakeCaptureRepository;
  let catalog: FakeCaptureCatalogReader;
  let create: CreateCategorizationRule;
  let update: UpdateCategorizationRule;

  beforeEach(() => {
    rules = new FakeCategorizationRuleRepository();
    captures = new FakeCaptureRepository();
    catalog = new FakeCaptureCatalogReader();
    catalog.categories.push(
      { userId: ANA, category: { id: 'viveres', type: 'VARIABLE_EXPENSE', archived: false } },
      { userId: ANA, category: { id: 'comida', type: 'VARIABLE_EXPENSE', archived: false } },
      { userId: ANA, category: { id: 'honorarios', type: 'INCOME', archived: false } },
      { userId: ANA, category: { id: 'vieja', type: 'VARIABLE_EXPENSE', archived: true } },
      { userId: BRUNO, category: { id: 'de-bruno', type: 'VARIABLE_EXPENSE', archived: false } },
    );
    create = new CreateCategorizationRule(rules, captures, catalog);
    update = new UpdateCategorizationRule(rules, captures, catalog);
  });

  describe('ListCategorizationRules', () => {
    it('lists the rules of the account, highest priority first', async () => {
      await create.execute(ANA, { pattern: 'Tambo', categoryId: 'viveres', priority: 0 });
      await create.execute(ANA, { pattern: 'Wong', categoryId: 'comida', priority: 5 });
      rules.add(BRUNO, {
        id: 'ajena',
        pattern: 'Plaza Vea',
        patternKey: 'plaza vea',
        categoryId: 'de-bruno',
        priority: 9,
      });

      const listed = await new ListCategorizationRules(rules).execute(ANA);

      expect(listed.map(({ pattern }) => pattern)).toEqual(['Wong', 'Tambo']);
    });
  });

  describe('CreateCategorizationRule', () => {
    it('creates a rule with its key without accents or case', async () => {
      await expect(
        create.execute(ANA, { pattern: 'Tambó Larco', categoryId: 'viveres', priority: 2 }),
      ).resolves.toMatchObject({
        pattern: 'Tambó Larco',
        patternKey: 'tambo larco',
        categoryId: 'viveres',
        priority: 2,
      });
    });

    it('accepts a category of any type: the rule has none', async () => {
      await expect(
        create.execute(ANA, { pattern: 'Te yapeó', categoryId: 'honorarios', priority: 0 }),
      ).resolves.toMatchObject({ categoryId: 'honorarios' });
    });

    it.each([
      ['the category of another account', 'de-bruno', CaptureCategoryNotFoundError],
      ['a category that does not exist', 'otra', CaptureCategoryNotFoundError],
      ['an archived category', 'vieja', ArchivedCategoryError],
    ])('refuses %s', async (_label, categoryId, error) => {
      await expect(
        create.execute(ANA, { pattern: 'Tambo', categoryId, priority: 0 }),
      ).rejects.toBeInstanceOf(error);
    });

    it('refuses a pattern the account already has, ignoring accents and case (2026-10-04)', async () => {
      await create.execute(ANA, { pattern: 'Tambo', categoryId: 'viveres', priority: 0 });

      await expect(
        create.execute(ANA, { pattern: 'TAMBÓ', categoryId: 'comida', priority: 0 }),
      ).rejects.toBeInstanceOf(CategorizationRulePatternTakenError);
    });

    it('lets another account use the same pattern', async () => {
      await create.execute(ANA, { pattern: 'Tambo', categoryId: 'viveres', priority: 0 });

      await expect(
        create.execute(BRUNO, { pattern: 'Tambo', categoryId: 'de-bruno', priority: 0 }),
      ).resolves.toMatchObject({ pattern: 'Tambo' });
    });

    describe('suggesting again in the inbox (decided 2026-10-04)', () => {
      it('gives its category to the captures in the inbox that have none', async () => {
        const waiting = await captures.create(ANA, pending());
        const duplicate = await captures.create(ANA, pending({ status: 'DUPLICATE' }));

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, waiting.id)).resolves.toMatchObject({
          categoryId: 'viveres',
        });
        await expect(captures.find(ANA, duplicate.id)).resolves.toMatchObject({
          categoryId: 'viveres',
        });
      });

      it('compares against the text of the notification when there is no merchant', async () => {
        const waiting = await captures.create(
          ANA,
          pending({ merchant: null, rawPayload: { rawText: 'Compra en TAMBO por S/ 5.00' } }),
        );

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, waiting.id)).resolves.toMatchObject({
          categoryId: 'viveres',
        });
      });

      it('leaves alone a capture that already has a category', async () => {
        const chosen = await captures.create(ANA, pending({ categoryId: 'comida' }));

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, chosen.id)).resolves.toMatchObject({
          categoryId: 'comida',
        });
      });

      it('leaves alone a capture the rule does not apply to', async () => {
        const other = await captures.create(ANA, pending({ merchant: 'Wong' }));

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, other.id)).resolves.toMatchObject({ categoryId: null });
      });

      it('leaves alone a capture of another type than the category', async () => {
        const income = await captures.create(ANA, pending({ type: 'INCOME' }));

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, income.id)).resolves.toMatchObject({ categoryId: null });
      });

      it('weighs every rule: a more specific older one still wins', async () => {
        await create.execute(ANA, { pattern: 'tambo larco', categoryId: 'comida', priority: 3 });
        const waiting = await captures.create(ANA, pending());

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(ANA, waiting.id)).resolves.toMatchObject({
          categoryId: 'comida',
        });
      });

      it('does not touch the captures of another account', async () => {
        const theirs = await captures.create(BRUNO, pending());

        await create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 });

        await expect(captures.find(BRUNO, theirs.id)).resolves.toMatchObject({
          categoryId: null,
        });
      });

      it('does not touch a capture confirmed or discarded meanwhile', async () => {
        await captures.create(ANA, pending());
        captures.update = () => Promise.resolve(null);

        await expect(
          create.execute(ANA, { pattern: 'tambo', categoryId: 'viveres', priority: 0 }),
        ).resolves.toMatchObject({ pattern: 'tambo' });
      });
    });
  });

  describe('UpdateCategorizationRule', () => {
    it('changes the pattern, the category and the priority', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });

      await expect(
        update.execute(ANA, rule.id, { pattern: 'Tambo Larcó', categoryId: 'comida', priority: 7 }),
      ).resolves.toEqual({
        id: rule.id,
        pattern: 'Tambo Larcó',
        patternKey: 'tambo larco',
        categoryId: 'comida',
        priority: 7,
      });
    });

    it('keeps its own pattern written another way', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });

      await expect(update.execute(ANA, rule.id, { pattern: 'TAMBO' })).resolves.toMatchObject({
        pattern: 'TAMBO',
      });
    });

    it('refuses the pattern of another rule of the account', async () => {
      await create.execute(ANA, { pattern: 'Wong', categoryId: 'comida', priority: 0 });
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });

      await expect(update.execute(ANA, rule.id, { pattern: 'wong' })).rejects.toBeInstanceOf(
        CategorizationRulePatternTakenError,
      );
    });

    it('refuses an archived category, and the category of another account', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });

      await expect(update.execute(ANA, rule.id, { categoryId: 'vieja' })).rejects.toBeInstanceOf(
        ArchivedCategoryError,
      );
      await expect(update.execute(ANA, rule.id, { categoryId: 'de-bruno' })).rejects.toBeInstanceOf(
        CaptureCategoryNotFoundError,
      );
    });

    it('does not check again a category that did not change, even if archived since', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });
      catalog.categories[0] = {
        userId: ANA,
        category: { id: 'viveres', type: 'VARIABLE_EXPENSE', archived: true },
      };

      await expect(update.execute(ANA, rule.id, { priority: 1 })).resolves.toMatchObject({
        priority: 1,
      });
    });

    it('suggests again in the inbox', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Wong',
        categoryId: 'viveres',
        priority: 0,
      });
      const waiting = await captures.create(ANA, pending());

      await update.execute(ANA, rule.id, { pattern: 'Tambo' });

      await expect(captures.find(ANA, waiting.id)).resolves.toMatchObject({
        categoryId: 'viveres',
      });
    });

    it('answers not found for the rule of another account', async () => {
      const theirs = await create.execute(BRUNO, {
        pattern: 'Tambo',
        categoryId: 'de-bruno',
        priority: 0,
      });

      await expect(update.execute(ANA, theirs.id, { priority: 1 })).rejects.toBeInstanceOf(
        CategorizationRuleNotFoundError,
      );
    });

    it('answers not found when the rule is deleted in between', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });
      rules.update = () => Promise.resolve(null);

      await expect(update.execute(ANA, rule.id, { priority: 1 })).rejects.toBeInstanceOf(
        CategorizationRuleNotFoundError,
      );
    });
  });

  describe('DeleteCategorizationRule', () => {
    it('deletes a rule of the account, and only of the account', async () => {
      const mine = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });
      const remove = new DeleteCategorizationRule(rules);

      await expect(remove.execute(BRUNO, mine.id)).rejects.toBeInstanceOf(
        CategorizationRuleNotFoundError,
      );
      await remove.execute(ANA, mine.id);

      await expect(rules.list(ANA)).resolves.toEqual([]);
    });
  });

  describe('FollowCategoryMerge (ADR-0005; decided 2026-10-04)', () => {
    it('moves the rules and the unconfirmed captures to the category they were merged into', async () => {
      const rule = await create.execute(ANA, {
        pattern: 'Tambo',
        categoryId: 'viveres',
        priority: 0,
      });
      const waiting = await captures.create(ANA, pending({ categoryId: 'viveres' }));
      const confirmed = await captures.create(ANA, pending({ categoryId: 'viveres' }));
      await captures.update(
        ANA,
        confirmed.id,
        { status: 'CONFIRMED', transactionId: 'transaccion' },
        ['PENDING'],
      );

      await new FollowCategoryMerge(rules, captures).execute({
        userId: ANA,
        fromId: 'viveres',
        intoId: 'comida',
      });

      await expect(rules.find(ANA, rule.id)).resolves.toMatchObject({ categoryId: 'comida' });
      await expect(captures.find(ANA, waiting.id)).resolves.toMatchObject({ categoryId: 'comida' });
      await expect(captures.find(ANA, confirmed.id)).resolves.toMatchObject({
        categoryId: 'viveres',
      });
    });
  });
});
