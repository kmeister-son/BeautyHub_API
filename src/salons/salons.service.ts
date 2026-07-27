import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCategory } from '@prisma/client';
import { haversineKm } from '../common/geo';
import { salonInclude, toSalonJson } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: string, search?: string, lat?: number, lng?: number) {
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
    return salons.map((s) => this.withDistance(s, lat, lng));
  }

  async findOne(id: string, lat?: number, lng?: number) {
    const salon = await this.prisma.salon.findUnique({
      where: { id },
      include: salonInclude,
    });
    if (!salon) throw new NotFoundException(`Salon not found: ${id}`);
    return this.withDistance(salon, lat, lng);
  }

  // distanceKm is stored as a static fallback; when the client sends its
  // real position we override it with the true great-circle distance.
  private withDistance(
    salon: Parameters<typeof toSalonJson>[0],
    lat?: number,
    lng?: number,
  ) {
    const json = toSalonJson(salon);
    if (lat !== undefined && lng !== undefined) {
      json.distanceKm = haversineKm(lat, lng, salon.latitude, salon.longitude);
    }
    return json;
  }
}
