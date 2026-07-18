import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { SalonsController } from './salons.controller';
import { SalonsService } from './salons.service';

@Module({
  imports: [BookingsModule],
  controllers: [SalonsController],
  providers: [SalonsService],
})
export class SalonsModule {}
