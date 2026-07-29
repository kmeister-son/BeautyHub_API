import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, ServiceCategory } from '@prisma/client';
import {
  salonInclude,
  toBookingJson,
  toSalonJson,
  toServiceJson,
  toStaffJson,
} from '../common/mappers';
import { salonWallClockToUtc } from '../common/timezone';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { CreateServiceDto, UpdateServiceDto } from './dto/upsert-service.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/upsert-staff.dto';

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every provider route is scoped to the salon the caller owns. */
  private async ownedSalon(ownerId: string) {
    const salon = await this.prisma.salon.findFirst({ where: { ownerId } });
    if (!salon)
      throw new NotFoundException(
        'No salon is linked to this provider account',
      );
    return salon;
  }

  async getSalon(ownerId: string) {
    const salon = await this.ownedSalon(ownerId);
    const full = await this.prisma.salon.findUniqueOrThrow({
      where: { id: salon.id },
      include: salonInclude,
    });
    return toSalonJson(full);
  }

  async updateSalon(ownerId: string, dto: UpdateSalonDto) {
    const salon = await this.ownedSalon(ownerId);
    const updated = await this.prisma.salon.update({
      where: { id: salon.id },
      data: dto,
      include: salonInclude,
    });
    return toSalonJson(updated);
  }

  async createService(ownerId: string, dto: CreateServiceDto) {
    const salon = await this.ownedSalon(ownerId);
    const service = await this.prisma.salonService.create({
      data: {
        salonId: salon.id,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        category: dto.category.toUpperCase() as ServiceCategory,
      },
    });
    return toServiceJson(service);
  }

  async updateService(
    ownerId: string,
    serviceId: string,
    dto: UpdateServiceDto,
  ) {
    const salon = await this.ownedSalon(ownerId);
    const existing = await this.prisma.salonService.findFirst({
      where: { id: serviceId, salonId: salon.id },
    });
    if (!existing)
      throw new NotFoundException(`Service not found: ${serviceId}`);
    const { category, ...rest } = dto;
    const service = await this.prisma.salonService.update({
      where: { id: serviceId },
      data: {
        ...rest,
        ...(category
          ? { category: category.toUpperCase() as ServiceCategory }
          : {}),
      },
    });
    return toServiceJson(service);
  }

  async deleteService(ownerId: string, serviceId: string) {
    const salon = await this.ownedSalon(ownerId);
    const deleted = await this.prisma.salonService.deleteMany({
      where: { id: serviceId, salonId: salon.id },
    });
    if (deleted.count === 0)
      throw new NotFoundException(`Service not found: ${serviceId}`);
  }

  async createStaff(ownerId: string, dto: CreateStaffDto) {
    const salon = await this.ownedSalon(ownerId);
    const staff = await this.prisma.staffMember.create({
      data: {
        salonId: salon.id,
        name: dto.name,
        role: dto.role,
        rating: dto.rating ?? 5,
      },
    });
    return toStaffJson(staff);
  }

  async updateStaff(ownerId: string, staffId: string, dto: UpdateStaffDto) {
    const salon = await this.ownedSalon(ownerId);
    const existing = await this.prisma.staffMember.findFirst({
      where: { id: staffId, salonId: salon.id },
    });
    if (!existing)
      throw new NotFoundException(`Staff member not found: ${staffId}`);
    const staff = await this.prisma.staffMember.update({
      where: { id: staffId },
      data: dto,
    });
    return toStaffJson(staff);
  }

  async deleteStaff(ownerId: string, staffId: string) {
    const salon = await this.ownedSalon(ownerId);
    const deleted = await this.prisma.staffMember.deleteMany({
      where: { id: staffId, salonId: salon.id },
    });
    if (deleted.count === 0)
      throw new NotFoundException(`Staff member not found: ${staffId}`);
  }

  async getBookings(ownerId: string, date?: string) {
    const salon = await this.ownedSalon(ownerId);
    // Lazy expiry: unanswered requests lapse the moment anyone looks.
    await this.prisma.booking.updateMany({
      where: {
        salonId: salon.id,
        status: BookingStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: BookingStatus.EXPIRED },
    });
    let range = {};
    if (date) {
      // A vendor's "day" is a salon-market calendar day, not a server-local one.
      const [year, month, day] = date.split('-').map(Number);
      range = {
        start: {
          gte: salonWallClockToUtc(year, month, day),
          lt: salonWallClockToUtc(year, month, day + 1),
        },
      };
    }
    const bookings = await this.prisma.booking.findMany({
      where: {
        salonId: salon.id,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        ...range,
      },
      orderBy: { start: 'asc' },
      include: { customer: { select: { name: true, isGuest: true } } },
    });
    // The vendor schedule needs to show who booked; guests have no real name.
    return bookings.map((b) => ({
      ...toBookingJson(b),
      customerName: b.customer.isGuest ? 'Guest' : b.customer.name,
    }));
  }

  /** Accept or decline a PENDING request on the caller's salon. */
  async respondToBooking(ownerId: string, bookingId: string, accept: boolean) {
    const salon = await this.ownedSalon(ownerId);
    // Guarded update: only a live PENDING row transitions, so a double-tap,
    // a response to an already-lapsed request, or a race between accept and
    // decline resolves to exactly one winner.
    const updated = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        salonId: salon.id,
        status: BookingStatus.PENDING,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: {
        status: accept ? BookingStatus.CONFIRMED : BookingStatus.DECLINED,
        respondedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.booking.findFirst({
        where: { id: bookingId, salonId: salon.id },
        select: { status: true },
      });
      if (!existing)
        throw new NotFoundException(`Booking not found: ${bookingId}`);
      throw new ConflictException(
        `This request is no longer pending (${existing.status.toLowerCase()}).`,
      );
    }
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { customer: { select: { name: true, isGuest: true } } },
    });
    return {
      ...toBookingJson(booking),
      customerName: booking.customer.isGuest ? 'Guest' : booking.customer.name,
    };
  }
}
