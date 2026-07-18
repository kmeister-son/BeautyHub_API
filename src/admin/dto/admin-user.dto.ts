import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn(['customer', 'provider', 'admin'])
  role?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
