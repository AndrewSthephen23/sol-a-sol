import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  RecoveryCodeRepository,
  StoredRecoveryCode,
} from '../ports/recovery-code-repository.js';

@Injectable()
export class PrismaRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceAll(userId: string, codeHashes: string[]): Promise<void> {
    // En una transacción: no puede quedar una cuenta sin los viejos y sin los nuevos.
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  async findUnused(userId: string, codeHash: string): Promise<StoredRecoveryCode | null> {
    // El `userId` va en la condición: un código de otra cuenta no puede abrir esta.
    return this.prisma.recoveryCode.findFirst({
      where: { userId, codeHash, usedAt: null },
      select: { id: true, userId: true },
    });
  }

  async markUsed(id: string, usedAt: Date): Promise<boolean> {
    // La condición `usedAt: null` va dentro del UPDATE: si dos peticiones llegan a la vez con
    // el mismo código, solo una lo gasta.
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { id, usedAt: null },
      data: { usedAt },
    });

    return count === 1;
  }

  async countUnused(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });
  }
}
