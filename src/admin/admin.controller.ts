import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { AdminBookingQueryDto } from './dto/admin-booking-query.dto';
import { AdminUpdateSalonDto, CreateSalonDto } from './dto/admin-salon.dto';
import { AdminUpdateUserDto } from './dto/admin-user.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('salons')
  listSalons() {
    return this.admin.listSalons();
  }

  @Post('salons')
  createSalon(@Body() dto: CreateSalonDto) {
    return this.admin.createSalon(dto);
  }

  @Patch('salons/:id')
  updateSalon(@Param('id') id: string, @Body() dto: AdminUpdateSalonDto) {
    return this.admin.updateSalon(id, dto);
  }

  @HttpCode(204)
  @Delete('salons/:id')
  deleteSalon(@Param('id') id: string) {
    return this.admin.deleteSalon(id);
  }

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.admin.updateUser(id, dto);
  }

  @Get('bookings')
  listBookings(@Query() query: AdminBookingQueryDto) {
    return this.admin.listBookings(query);
  }
}
