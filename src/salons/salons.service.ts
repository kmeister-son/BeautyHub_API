import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCategory } from '@prisma/client';
import { salonInclude, toSalonJson } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: string, search?: string) {
    const where: Prisma.SalonWhereInput = {};
    if (category) {
      where.categories = { has: category.toUpperCase() as ServiceCategory };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tagline: { contains: search, mode: 'insensitive' } },
      ];
    }
    const salons = await this.prisma.salon.findMany({
      where,
      include: salonInclude,
      // coverSeed follows the original catalogue order, giving the app the
      // same stable listing the mock repository produced.
      orderBy: { coverSeed: 'asc' },
    });
    return salons.map(toSalonJson);
  }

  async findOne(id: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id },
      include: salonInclude,
    });
    if (!salon) throw new NotFoundException(`Salon not found: ${id}`);
    return toSalonJson(salon);
  }
}
