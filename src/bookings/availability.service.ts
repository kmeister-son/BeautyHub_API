import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { salonWallClockToUtc } from '../common/timezone';
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
      throw new BadRequestException(
        `Staff member ${staffId} does not work at ${salonId}`,
      );
    }

    // The date param and open/close hours are salon-market wall-clock time;
    // everything below runs on UTC instants.
    const [year, month, day] = date.split('-').map(Number);
    const open = salonWallClockToUtc(year, month, day, salon.openHour);
    const close = salonWallClockToUtc(year, month, day, salon.closeHour);
    const lastStart = new Date(close.getTime() - durationMinutes * 60_000);

    // One indexed query for the day's slot-holding bookings; overlap in
    // memory. PENDING requests hold their slot until answered or expired,
    // matching the no_double_booking exclusion constraint.
    const dayBookings = await this.prisma.booking.findMany({
      where: {
        salonId,
        start: { lt: close },
        end: { gt: open },
        AND: [
          {
            OR: [
              { status: BookingStatus.CONFIRMED },
              { status: BookingStatus.PENDING, expiresAt: { gt: new Date() } },
            ],
          },
          // With a specific professional, only their bookings block — plus
          // "any professional" bookings, which occupy an unknown chair.
          ...(staffId ? [{ OR: [{ staffId }, { staffId: null }] }] : []),
        ],
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
      const conflicts = dayBookings.some(
        (b) => slotStart < b.end && b.start < slotEnd,
      );
      if (!conflicts && slotStart > now) slots.push(slotStart.toISOString());
    }
    return slots;
  }
}
