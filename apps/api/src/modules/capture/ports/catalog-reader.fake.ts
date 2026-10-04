import type {
  CaptureCatalogCategory,
  CaptureCatalogPaymentMethod,
  CaptureCatalogReader,
} from './catalog-reader.js';

/** El catálogo en memoria, por cuenta. */
export class FakeCaptureCatalogReader implements CaptureCatalogReader {
  readonly paymentMethods: { userId: string; method: CaptureCatalogPaymentMethod }[] = [];
  readonly categories: { userId: string; category: CaptureCatalogCategory }[] = [];

  allPaymentMethods(userId: string): Promise<CaptureCatalogPaymentMethod[]> {
    return Promise.resolve(
      this.paymentMethods.filter((entry) => entry.userId === userId).map((entry) => entry.method),
    );
  }

  allCategories(userId: string): Promise<CaptureCatalogCategory[]> {
    return Promise.resolve(
      this.categories.filter((entry) => entry.userId === userId).map((entry) => entry.category),
    );
  }
}
