// API pública del módulo catalog.
// Otros módulos solo pueden importar desde aquí, nunca de sus carpetas internas.
export { CatalogModule } from './catalog.module.js';
export { SeedAccountsWithoutCategories } from './application/default-categories.js';
export {
  CatalogLookup,
  type CategoryReference,
  type PaymentMethodReference,
} from './application/catalog-lookup.js';
