import { Inject, Injectable } from '@nestjs/common';
import { normalizeTagName } from '@sol-a-sol/domain';

import { TagNotFoundError } from '../domain/errors.js';
import { type Tag, TAG_REPOSITORY, type TagRepository } from '../ports/tag-repository.js';

@Injectable()
export class ListTags {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  async execute({ userId }: { userId: string }): Promise<Tag[]> {
    return this.tags.list(userId);
  }
}

/**
 * Renombra una etiqueta. Si el nombre nuevo es el de **otra** etiqueta de la cuenta (sin
 * mayúsculas ni tildes), las **fusiona**: sus transacciones quedan con la otra, que toma la
 * escritura mandada, y esta desaparece (decidido con el autor el 2026-09-28). Devuelve la que
 * queda.
 */
@Injectable()
export class RenameTag {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  async execute({ userId, id, name }: { userId: string; id: string; name: string }): Promise<Tag> {
    const current = await this.tags.find(userId, id);
    if (current === null) throw new TagNotFoundError();

    const renamed = normalizeTagName(name);
    const other = await this.tags.findByKey(userId, renamed.key);
    const result =
      other === null || other.id === id
        ? await this.tags.rename(userId, id, renamed)
        : await this.tags.merge(userId, id, other.id, renamed.name);
    // Entre la lectura y la escritura pudo borrarse: para quien llama, simplemente no existe.
    if (result === null) throw new TagNotFoundError();

    return result;
  }
}

/** La borra y la quita de todas las transacciones, que quedan intactas. Sin archivar. */
@Injectable()
export class DeleteTag {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  async execute({ userId, id }: { userId: string; id: string }): Promise<void> {
    if (!(await this.tags.delete(userId, id))) throw new TagNotFoundError();
  }
}
