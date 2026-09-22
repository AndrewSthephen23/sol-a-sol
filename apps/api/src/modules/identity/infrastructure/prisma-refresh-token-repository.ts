import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  NewRefreshToken,
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../ports/refresh-token-repository.js';

const STORED_FIELDS = {
  id: true,
  userId: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ userId, tokenHash, expiresAt }: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash }, select: STORED_FIELDS });
  }

  async markUsed(id: string, usedAt: Date): Promise<boolean> {
    // La condición `usedAt: null` va en el propio UPDATE: si dos peticiones llegan a la vez con
    // el mismo token, solo una lo marca y la otra se encuentra con el reuso, como debe ser.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt },
    });

    return count === 1;
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeAllForUser(
    userId: string,
    revokedAt: Date,
    exceptTokenHash?: string,
  ): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptTokenHash === undefined ? {} : { tokenHash: { not: exceptTokenHash } }),
      },
      data: { revokedAt },
    });

    return count;
  }
}
