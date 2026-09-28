/**
 * Eventos que publica `catalog`. Son parte de su API pública (`index.ts`): otro módulo los escucha
 * sin importar nada más de aquí (ADR-0004, ADR-0005).
 */

/**
 * Una categoría se fusionó en otra y quedó archivada (decidido con el autor el 2026-09-28).
 * `transactions` lo escucha para pasar sus transacciones a `intoId`; el presupuesto (H4) lo
 * escuchará para sus partidas. Una fusión con hijas del mismo nombre publica uno por cada par.
 */
export const CATEGORY_MERGED = 'catalog.category.merged';

export interface CategoryMerged {
  userId: string;
  fromId: string;
  intoId: string;
}
