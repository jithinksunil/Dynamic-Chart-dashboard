import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ChartType } from '../../generated/prisma/client';

export class ChartConfigDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEnum(ChartType)
  chartType: ChartType;

  @IsNotEmpty()
  @IsString()
  xAxis: string;

  @IsNotEmpty()
  @IsString()
  yAxis: string;
}

export class BuildChartsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChartConfigDto)
  charts: ChartConfigDto[];
}
