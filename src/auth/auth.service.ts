import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toProfile(user);
  }
}
