import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
