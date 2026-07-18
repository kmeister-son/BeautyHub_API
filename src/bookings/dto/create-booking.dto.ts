import { ArrayNotEmpty, IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  salonId!: string;

  @IsDateString()
  start!: string;

  /**
   * Service names as displayed to the customer. The server resolves them to
   * service rows within the salon; names keep the current Flutter contract
   * working unchanged. `serviceIds` is accepted too for future clients.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  serviceNames!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

  @IsOptional()
  @IsString()
  staffName?: string;

  @IsOptional()
  @IsString()
  staffId?: string;
}
