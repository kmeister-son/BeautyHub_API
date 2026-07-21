import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminBookingQueryDto {
  @IsOptional()
  @IsString()
  salonId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsIn(['confirmed', 'cancelled'])
  status?: string;
}
