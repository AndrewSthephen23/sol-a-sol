import { z } from 'zod';

/** Topes defensivos, no reglas de negocio. */
export const CATEGORY_NAME_MAX_LENGTH = 60;
export const CATEGORY_ICON_MAX_LENGTH = 40;
/** Más largo que `#RRGGBB` a propósito: el formato lo exige el dominio (`INVALID_CATEGORY_COLOR`). */
export const CATEGORY_COLOR_MAX_LENGTH = 16;

/** Los tipos del glosario. Una prueba de la API comprueba que coincidan con el dominio. */
export const transactionTypeSchema = z.enum([
  'INCOME',
  'FIXED_EXPENSE',
  'VARIABLE_EXPENSE',
  'SAVING',
  'INVESTMENT',
  'DEBT',
]);

const name = z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH);
const color = z.string().max(CATEGORY_COLOR_MAX_LENGTH);
/** Nombre de un ícono de la web, en kebab-case (`shopping-cart`), no una imagen. */
const icon = z
  .string()
  .max(CATEGORY_ICON_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

/**
 * Crea una categoría o, con `parentId`, una subcategoría. El tipo lo necesita una categoría de
 * primer nivel; una subcategoría hereda el de su madre (mandar otro es un error del dominio).
 * Sin color o ícono, una subcategoría toma los de su madre y una categoría, unos por defecto.
 *
 * **Estricto:** un campo desconocido se rechaza, y un `userId` en el cuerpo no se ignora.
 */
export const createCategoryRequestSchema = z.strictObject({
  name,
  type: transactionTypeSchema.optional(),
  parentId: z.uuid().optional(),
  color: color.optional(),
  icon: icon.optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

/**
 * Se renombra, se cambia el color o el ícono, y se archiva o restaura con `archived`. El tipo y
 * la madre no se cambian: las transacciones quedarían con otro tipo que su categoría.
 */
export const updateCategoryRequestSchema = z
  .strictObject({
    name: name.optional(),
    color: color.optional(),
    icon: icon.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change.' });

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

/** `?type=` filtra por tipo; `?includeArchived=true` suma las archivadas. */
export const listCategoriesQuerySchema = z.object({
  type: transactionTypeSchema.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
