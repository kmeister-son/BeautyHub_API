import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

const CATEGORIES = ['haircut', 'barber', 'nails', 'spa', 'makeup', 'skincare'];

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsIn(CATEGORIES)
  category!: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: string;
}
