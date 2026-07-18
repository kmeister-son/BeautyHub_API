import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityQueryDto } from '../bookings/dto/availability-query.dto';
import { AvailabilityService } from '../bookings/availability.service';
import { SalonsService } from './salons.service';

@ApiTags('salons')
@Public()
@Controller('salons')
export class SalonsController {
  constructor(
    private readonly salons: SalonsService,
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  findAll(@Query('category') category?: string, @Query('search') search?: string) {
    return this.salons.findAll(category, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salons.findOne(id);
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query() query: AvailabilityQueryDto) {
    return this.availability.getAvailableSlots(
      id,
      query.date,
      query.durationMinutes,
      query.staffId,
    );
  }
}
