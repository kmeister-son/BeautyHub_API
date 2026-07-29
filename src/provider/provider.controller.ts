import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { CreateServiceDto, UpdateServiceDto } from './dto/upsert-service.dto';
import { CreateStaffDto, UpdateStaffDto } from './dto/upsert-staff.dto';
import { ProviderService } from './provider.service';

@ApiTags('provider')
@ApiBearerAuth()
@Roles(Role.PROVIDER)
@Controller('provider')
export class ProviderController {
  constructor(private readonly provider: ProviderService) {}

  @Get('salon')
  getSalon(@CurrentUser() user: AuthUser) {
    return this.provider.getSalon(user.id);
  }

  @Patch('salon')
  updateSalon(@CurrentUser() user: AuthUser, @Body() dto: UpdateSalonDto) {
    return this.provider.updateSalon(user.id, dto);
  }

  @Post('services')
  createService(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.provider.createService(user.id, dto);
  }

  @Patch('services/:id')
  updateService(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.provider.updateService(user.id, id, dto);
  }

  @HttpCode(204)
  @Delete('services/:id')
  deleteService(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.provider.deleteService(user.id, id);
  }

  @Post('staff')
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.provider.createStaff(user.id, dto);
  }

  @Patch('staff/:id')
  updateStaff(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.provider.updateStaff(user.id, id, dto);
  }

  @HttpCode(204)
  @Delete('staff/:id')
  deleteStaff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.provider.deleteStaff(user.id, id);
  }

  @Get('bookings')
  getBookings(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.provider.getBookings(user.id, date);
  }

  @Post('bookings/:id/accept')
  acceptBooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.provider.respondToBooking(user.id, id, true);
  }

  @Post('bookings/:id/decline')
  declineBooking(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.provider.respondToBooking(user.id, id, false);
  }
}
