import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';
import { MailerService } from './mailer.service';

const RESET_CODE_TTL_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
  ) {}

  private sign(user: User, expiresIn: JwtSignOptions['expiresIn']) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return this.jwt.sign(payload, { expiresIn });
  }

  private toProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase(),
      isGuest: user.isGuest,
    };
  }

  async register(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        role: Role.CUSTOMER,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    return { token: this.sign(user, '30d'), user: this.toProfile(user) };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { token: this.sign(user, '30d'), user: this.toProfile(user) };
  }

  /** Anonymous identity for the customer app: one guest user per install. */
  async guest() {
    const user = await this.prisma.user.create({
      data: {
        email: `guest-${randomUUID()}@guest.beautyhub.app`,
        name: 'Guest',
        role: Role.CUSTOMER,
        isGuest: true,
      },
    });
    return { token: this.sign(user, '3650d'), user: this.toProfile(user) };
  }

  /** Issues a one-time reset code. Always answers ok so the endpoint cannot
   *  be used to probe which emails have accounts. */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return { ok: true };
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      },
    });
    this.mailer.sendPasswordResetCode(user.email, code);
    // Until a real mail provider exists, dev builds echo the code so the
    // flow can be exercised end to end. Never in production.
    return process.env.NODE_ENV === 'production'
      ? { ok: true }
      : { ok: true, devCode: code };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const invalid = () => new BadRequestException('Invalid or expired code');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) throw invalid();
    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset || !(await bcrypt.compare(code, reset.codeHash))) {
      throw invalid();
    }
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10) },
      }),
    ]);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toProfile(user);
  }

  /** Store-compliance requirement (Apple 5.1.1(v)): permanently removes the
   *  account and its personal data. Bookings are deleted rather than
   *  anonymised; owned salons are detached, not deleted, so a provider's
   *  catalogue survives an account deletion. */
  async deleteAccount(userId: string) {
    await this.prisma.$transaction([
      this.prisma.booking.deleteMany({ where: { customerId: userId } }),
      this.prisma.salon.updateMany({
        where: { ownerId: userId },
        data: { ownerId: null },
      }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    return { ok: true };
  }
}
