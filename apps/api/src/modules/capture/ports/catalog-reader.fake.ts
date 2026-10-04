import type {
  CaptureCatalogCategory,
  CaptureCatalogPaymentMethod,
  CaptureCatalogReader,
  CaptureCategoryReference,
  CapturePaymentMethodReference,
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

  category(userId: string, id: string): Promise<CaptureCategoryReference | null> {
    const found = this.categories.find(
      (entry) => entry.userId === userId && entry.category.id === id,
    );
    return Promise.resolve(found?.category ?? null);
  }

  paymentMethod(userId: string, id: string): Promise<CapturePaymentMethodReference | null> {
    const found = this.paymentMethods.find(
      (entry) => entry.userId === userId && entry.method.id === id,
    );
    return Promise.resolve(found?.method ?? null);
  }

  allCategories(userId: string): Promise<CaptureCatalogCategory[]> {
    return Promise.resolve(
      this.categories.filter((entry) => entry.userId === userId).map((entry) => entry.category),
    );
  }
}
