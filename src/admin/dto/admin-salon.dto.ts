import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const CATEGORIES = ['haircut', 'barber', 'nails', 'spa', 'makeup', 'skincare'];

export class CreateSalonDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  tagline!: string;

  @IsString()
  about!: string;

  @IsString()
  address!: string;

  @IsNumber()
  @Min(0)
  distanceKm!: number;

  @IsArray()
  @IsIn(CATEGORIES, { each: true })
  categories!: string[];

  @IsInt()
  @Min(0)
  @Max(23)
  openHour!: number;

  @IsInt()
  @Min(1)
  @Max(24)
  closeHour!: number;

  @IsInt()
  @Min(0)
  coverSeed!: number;

  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class AdminUpdateSalonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsArray()
  @IsIn(CATEGORIES, { each: true })
  categories?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  openHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  closeHour?: number;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  ownerId?: string | null;
}
