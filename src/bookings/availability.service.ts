import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SLOT_STEP_MINUTES = 30;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Available start times at a salon on a calendar day for an appointment of
   * the given duration. Ported from the app's MockBookingRepository, minus its
   * pseudo-random thinning: real availability comes from real bookings.
   */
  async getAvailableSlots(
    salonId: string,
    date: string,
    durationMinutes: number,
    staffId?: string,
  ): Promise<string[]> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      include: { staff: staffId ? { where: { id: staffId } } : false },
    });
    if (!salon) throw new NotFoundException(`Salon not found: ${salonId}`);
    if (staffId && salon.staff.length === 0) {
      throw new BadRequestException(`Staff member ${staffId} does not work at ${salonId}`);
    }

    const [year, month, day] = date.split('-').map(Number);
    const open = new Date(year, month - 1, day, salon.openHour);
    const lastStart = new Date(
      new Date(year, month - 1, day, salon.closeHour).getTime() - durationMinutes * 60_000,
    );

    // One indexed query for the day's confirmed bookings; overlap in memory.
    const dayBookings = await this.prisma.booking.findMany({
      where: {
        salonId,
        status: BookingStatus.CONFIRMED,
        start: { lt: new Date(year, month - 1, day, salon.closeHour) },
        end: { gt: open },
        // With a specific professional, only their bookings block — plus
        // "any professional" bookings, which occupy an unknown chair.
        ...(staffId ? { OR: [{ staffId }, { staffId: null }] } : {}),
      },
      select: { start: true, end: true },
    });

    const now = new Date();
    const slots: string[] = [];
    for (
      let t = open.getTime();
      t <= lastStart.getTime();
      t += SLOT_STEP_MINUTES * 60_000
    ) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + durationMinutes * 60_000);
      const conflicts = dayBookings.some((b) => slotStart < b.end && b.start < slotEnd);
      if (!conflicts && slotStart > now) slots.push(slotStart.toISOString());
    }
    return slots;
  }
}
