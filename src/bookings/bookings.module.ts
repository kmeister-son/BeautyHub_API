import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, AvailabilityService],
  exports: [AvailabilityService],
})
export class BookingsModule {}
