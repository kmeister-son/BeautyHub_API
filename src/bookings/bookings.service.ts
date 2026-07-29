import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { toBookingJson } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const EXCLUSION_VIOLATION = '23P01';

/** How long a salon owner gets to respond before a PENDING request lapses. */
const PENDING_TTL_HOURS = 24;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string) {
    // Lazy expiry: requests the owner never answered flip to EXPIRED the next
    // time anyone reads them — no scheduler needed at this scale.
    await this.prisma.booking.updateMany({
      where: {
        customerId: userId,
        status: BookingStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: BookingStatus.EXPIRED },
    });
    const bookings = await this.prisma.booking.findMany({
      where: { customerId: userId },
      orderBy: { start: 'desc' },
    });
    return bookings.map(toBookingJson);
  }

  async create(userId: string, dto: CreateBookingDto) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: dto.salonId },
      include: { services: true, staff: true },
    });
    if (!salon) throw new NotFoundException(`Salon not found: ${dto.salonId}`);

    // Resolve services by id when provided, otherwise by display name — the
    // Dart Booking entity only carries names. Totals are always computed
    // server-side from live rows; nothing money-related is trusted from the client.
    const services = dto.serviceIds?.length
      ? dto.serviceIds.map((id) => {
          const svc = salon.services.find((s) => s.id === id);
          if (!svc) throw new BadRequestException(`Unknown service id: ${id}`);
          return svc;
        })
      : dto.serviceNames.map((name) => {
          const svc = salon.services.find((s) => s.name === name);
          if (!svc) throw new BadRequestException(`Unknown service: ${name}`);
          return svc;
        });

    let staff: (typeof salon.staff)[number] | null = null;
    if (dto.staffId || dto.staffName) {
      staff =
        salon.staff.find((m) =>
          dto.staffId ? m.id === dto.staffId : m.name === dto.staffName,
        ) ?? null;
      if (!staff) {
        throw new BadRequestException(
          `Unknown staff member: ${dto.staffId ?? dto.staffName}`,
        );
      }
    }

    const start = new Date(dto.start);
    const totalDurationMinutes = services.reduce(
      (sum, s) => sum + s.durationMinutes,
      0,
    );
    const totalPrice = services.reduce((sum, s) => sum + Number(s.price), 0);
    const end = new Date(start.getTime() + totalDurationMinutes * 60_000);

    // Salons that vet their bookings get a PENDING request the owner must
    // accept before it confirms; it holds the slot until answered or expired.
    const autoConfirm = salon.autoConfirmBookings;

    // Lapsed requests still count as PENDING in the exclusion constraint
    // until something flips them; sweep so they can't block a live booking.
    await this.prisma.booking.updateMany({
      where: {
        salonId: salon.id,
        status: BookingStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: BookingStatus.EXPIRED },
    });

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // Friendly pre-check; the exclusion constraint is the hard guarantee.
        const clash = await tx.booking.findFirst({
          where: {
            salonId: salon.id,
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            start: { lt: end },
            end: { gt: start },
          },
          select: { id: true },
        });
        if (clash)
          throw new ConflictException('That slot has just been taken.');

        return tx.booking.create({
          data: {
            customerId: userId,
            salonId: salon.id,
            staffId: staff?.id ?? null,
            start,
            end,
            totalDurationMinutes,
            totalPrice,
            status: autoConfirm
              ? BookingStatus.CONFIRMED
              : BookingStatus.PENDING,
            expiresAt: autoConfirm
              ? null
              : new Date(Date.now() + PENDING_TTL_HOURS * 3_600_000),
            salonName: salon.name,
            salonAddress: salon.address,
            coverSeed: salon.coverSeed,
            serviceNames: services.map((s) => s.name),
            staffName: staff?.name ?? null,
          },
        });
      });
      return toBookingJson(booking);
    } catch (e) {
      if (e instanceof Error && e.message.includes(EXCLUSION_VIOLATION)) {
        throw new ConflictException('That slot has just been taken.');
      }
      throw e;
    }
  }

  async cancel(user: AuthUser, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (
      !booking ||
      (booking.customerId !== user.id && user.role !== Role.ADMIN)
    ) {
      throw new NotFoundException(`Booking not found: ${bookingId}`);
    }
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
    });
  }
}
