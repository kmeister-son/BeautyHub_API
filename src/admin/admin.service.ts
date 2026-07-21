import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, Role, ServiceCategory } from '@prisma/client';
import { salonInclude, toAdminBookingJson, toSalonJson } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBookingQueryDto } from './dto/admin-booking-query.dto';
import { AdminUpdateSalonDto, CreateSalonDto } from './dto/admin-salon.dto';
import { AdminUpdateUserDto } from './dto/admin-user.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listSalons() {
    const salons = await this.prisma.salon.findMany({
      include: salonInclude,
      orderBy: { name: 'asc' },
    });
    return salons.map(toSalonJson);
  }

  async createSalon(dto: CreateSalonDto) {
    const salon = await this.prisma.salon.create({
      data: {
        id: dto.id,
        name: dto.name,
        tagline: dto.tagline,
        about: dto.about,
        address: dto.address,
        distanceKm: dto.distanceKm,
        rating: 0,
        reviewCount: 0,
        categories: dto.categories.map((c) => c.toUpperCase() as ServiceCategory),
        openHour: dto.openHour,
        closeHour: dto.closeHour,
        isFeatured: false,
        coverSeed: dto.coverSeed,
        ownerId: dto.ownerId,
      },
      include: salonInclude,
    });
    return toSalonJson(salon);
  }

  async updateSalon(id: string, dto: AdminUpdateSalonDto) {
    const { categories, ...rest } = dto;
    try {
      const salon = await this.prisma.salon.update({
        where: { id },
        data: {
          ...rest,
          ...(categories
            ? { categories: categories.map((c) => c.toUpperCase() as ServiceCategory) }
            : {}),
        },
        include: salonInclude,
      });
      return toSalonJson(salon);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`Salon not found: ${id}`);
      }
      throw e;
    }
  }

  async deleteSalon(id: string) {
    const bookings = await this.prisma.booking.count({ where: { salonId: id } });
    if (bookings > 0) {
      throw new ConflictException('Salon has bookings; it cannot be deleted.');
    }
    try {
      await this.prisma.salon.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`Salon not found: ${id}`);
      }
      throw e;
    }
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role.toLowerCase(),
      isGuest: u.isGuest,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async updateUser(id: string, dto: AdminUpdateUserDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.role ? { role: dto.role.toUpperCase() as Role } : {}),
        },
      });
      return { id: user.id, email: user.email, name: user.name, role: user.role.toLowerCase() };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`User not found: ${id}`);
      }
      throw e;
    }
  }

  async listBookings(query: AdminBookingQueryDto) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(query.salonId ? { salonId: query.salonId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status.toUpperCase() as BookingStatus } : {}),
      },
      include: { customer: true },
      orderBy: { start: 'desc' },
    });
    return bookings.map(toAdminBookingJson);
  }
}
