import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  NewPersonalAccessToken,
  PersonalAccessTokenRepository,
  PersonalAccessTokenSummary,
  StoredPersonalAccessToken,
} from '../ports/personal-access-token-repository.js';

/** Nunca se selecciona `tokenHash` para mostrar: ni siquiera el hash sale en una respuesta. */
const SUMMARY_FIELDS = {
  id: true,
  name: true,
  scopes: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
} as const;

@Injectable()
export class PrismaPersonalAccessTokenRepository implements PersonalAccessTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewPersonalAccessToken): Promise<PersonalAccessTokenSummary> {
    return this.prisma.personalAccessToken.create({ data: token, select: SUMMARY_FIELDS });
  }

  async listActive(userId: string): Promise<PersonalAccessTokenSummary[]> {
    return this.prisma.personalAccessToken.findMany({
      where: { userId, revokedAt: null },
      select: SUMMARY_FIELDS,
      // UUIDv7 ordena por fecha de creación, y desempata dos tokens creados en el mismo milisegundo.
      orderBy: { id: 'desc' },
    });
  }

  async revoke(userId: string, id: string, revokedAt: Date): Promise<boolean> {
    // `userId` va en el propio UPDATE: aunque alguien adivine el id de un token ajeno, la fila
    // no coincide y no se toca.
    const { count } = await this.prisma.personalAccessToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt },
    });

    return count === 1;
  }

  async findForAuthentication(id: string): Promise<StoredPersonalAccessToken | null> {
    return this.prisma.personalAccessToken.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        tokenHash: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async recordUse(id: string, usedAt: Date): Promise<void> {
    await this.prisma.personalAccessToken.update({ where: { id }, data: { lastUsedAt: usedAt } });
  }
}
