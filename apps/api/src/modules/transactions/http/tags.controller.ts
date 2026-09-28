import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { type RenameTagRequest, renameTagRequestSchema } from '@sol-a-sol/contracts';
import { z } from 'zod';

import { RequiresFeature } from '../../../shared/feature-flags/feature-flag.guard.js';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe.js';
import { AccessTokenGuard, CurrentUser } from '../../identity/index.js';
import { DeleteTag, ListTags, RenameTag } from '../application/tags.js';
import { TagNotFoundError } from '../domain/errors.js';
import type { Tag } from '../ports/tag-repository.js';

const tagIdSchema = z.uuid();

/**
 * Gestión de las etiquetas de la cuenta. Se **crean** al usarlas en una transacción; aquí se ven,
 * se renombran (o se fusionan) y se borran. Parte del módulo `transactions`, detrás de su flag.
 */
@Controller('tags')
@RequiresFeature('transactions')
@UseGuards(AccessTokenGuard)
export class TagsController {
  constructor(
    private readonly listTags: ListTags,
    private readonly renameTag: RenameTag,
    private readonly deleteTag: DeleteTag,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<Tag[]> {
    return this.listTags.execute({ userId });
  }

  /** Con el nombre de otra etiqueta de la cuenta, las fusiona y devuelve la que queda. */
  @Patch(':id')
  async rename(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameTagRequestSchema)) body: RenameTagRequest,
  ): Promise<Tag> {
    assertTagId(id);

    return this.renameTag.execute({ userId, id, name: body.name });
  }

  /** La quita de todas las transacciones, que quedan intactas. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    assertTagId(id);

    await this.deleteTag.execute({ userId, id });
  }
}

/** Un id que ni siquiera es un UUID tampoco existe: 404 y no 422. */
function assertTagId(id: string): void {
  if (!tagIdSchema.safeParse(id).success) throw new TagNotFoundError();
}
