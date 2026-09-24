import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { EmailAlreadyRegisteredError } from '../domain/errors.js';
import type {
  NewUser,
  UserAccount,
  UserCredentials,
  UserRepository,
} from '../ports/user-repository.js';

/** Prisma señala la violación de una restricción única con este código. */
const UNIQUE_VIOLATION = 'P2002';

/** `select` explícito: así el hash y el secreto TOTP no salen de aquí por descuido. */
const CREDENTIALS_FIELDS = {
  id: true,
  email: true,
  passwordHash: true,
  totpSecret: true,
  totpConfirmedAt: true,
  totpLastCounter: true,
} as const;

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hasAnyUser(): Promise<boolean> {
    return (await this.prisma.user.findFirst({ select: { id: true } })) !== null;
  }

  async listIds(): Promise<string[]> {
    // UUIDv7 ordena por fecha de creación.
    const users = await this.prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });

    return users.map((user) => user.id);
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { email }, select: CREDENTIALS_FIELDS });
  }

  async findCredentialsById(userId: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: CREDENTIALS_FIELDS });
  }

  async startTotpEnrolment(userId: string, encryptedSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      // Se reinicia lo demás: una activación nueva no puede heredar la confirmación ni el
      // contador de la anterior.
      data: { totpSecret: encryptedSecret, totpConfirmedAt: null, totpLastCounter: null },
    });
  }

  async confirmTotp(userId: string, confirmedAt: Date, counter: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpConfirmedAt: confirmedAt, totpLastCounter: BigInt(counter) },
    });
  }

  async recordTotpCounter(userId: string, counter: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpLastCounter: BigInt(counter) },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpConfirmedAt: null, totpLastCounter: null },
    });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async create({ email, passwordHash }: NewUser): Promise<UserAccount> {
    try {
      // `select` explícito: así el hash no puede salir de aquí por descuido.
      return await this.prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true, createdAt: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailAlreadyRegisteredError();
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}
