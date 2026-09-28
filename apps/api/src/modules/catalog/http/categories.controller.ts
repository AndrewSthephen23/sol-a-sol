import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateCategoryRequest,
  createCategoryRequestSchema,
  type ListCategoriesQuery,
  listCategoriesQuerySchema,
  type MergeCategoryRequest,
  mergeCategoryRequestSchema,
  type UpdateCategoryRequest,
  updateCategoryRequestSchema,
} from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import {
  CreateCategory,
  type CategoryTreeNode,
  ListCategories,
  UpdateCategory,
} from '../application/categories.js';
import { ConvertCategoryToTag, MergeCategory } from '../application/merge-category.js';
import { CategoryNotFoundError } from '../domain/errors.js';
import type { Category } from '../ports/category-repository.js';

const categoryIdSchema = z.uuid();

/**
 * Categorías y subcategorías de cada usuario.
 *
 * Sin `DELETE`: una categoría con transacciones no se borra, se archiva (`archived: true`), y
 * archivar una madre archiva sus hijas. Solo desde una sesión; un token personal recibe 403.
 */
@Controller('categories')
@RequiresFeature('catalog')
@UseGuards(AccessTokenGuard)
export class CategoriesController {
  constructor(
    private readonly createCategory: CreateCategory,
    private readonly listCategories: ListCategories,
    private readonly updateCategory: UpdateCategory,
    private readonly mergeCategory: MergeCategory,
    private readonly convertToTag: ConvertCategoryToTag,
  ) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQuery,
  ): Promise<CategoryTreeNode[]> {
    return this.listCategories.execute({ userId, ...query });
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createCategoryRequestSchema)) body: CreateCategoryRequest,
  ): Promise<Category> {
    return this.createCategory.execute({ userId, ...body });
  }

  /** 404 si no existe **o es de otra cuenta**: desde fuera no se distinguen. */
  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryRequestSchema)) body: UpdateCategoryRequest,
  ): Promise<Category> {
    assertCategoryId(id);

    return this.updateCategory.execute({ userId, id, changes: body });
  }

  /**
   * Fusiona la categoría en otra y devuelve la destino. Sus transacciones las mueve
   * `transactions` al escuchar la fusión (ADR-0005). 404 si alguna no existe o es ajena.
   */
  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  async merge(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeCategoryRequestSchema)) body: MergeCategoryRequest,
  ): Promise<Category> {
    assertCategoryId(id);

    return this.mergeCategory.execute({ userId, id, intoId: body.intoCategoryId });
  }

  /**
   * Convierte una subcategoría en etiqueta: se fusiona en su madre, y sus transacciones quedan
   * con la etiqueta de su nombre. Devuelve la madre.
   */
  @Post(':id/convert-to-tag')
  @HttpCode(HttpStatus.OK)
  async toTag(@CurrentUser() userId: string, @Param('id') id: string): Promise<Category> {
    assertCategoryId(id);

    return this.convertToTag.execute({ userId, id });
  }
}

/** Un id que ni siquiera es un UUID tampoco existe: 404, y la base no llega a verlo. */
function assertCategoryId(id: string): void {
  if (!categoryIdSchema.safeParse(id).success) throw new CategoryNotFoundError();
}
