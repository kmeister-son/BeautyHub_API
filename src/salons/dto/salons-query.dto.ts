import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class SalonsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** Customer's current position, used to compute real distanceKm. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
