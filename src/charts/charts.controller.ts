import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ChartsService } from './charts.service';
import { BuildChartsDto } from './dto/build-charts.dto';
import { UserId } from '../guards/user-id.decorator';

@Controller('charts')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get(':csvUploadId')
  getCharts(
    @Param('csvUploadId') csvUploadId: string,
    @UserId() userId: string,
  ): Promise<unknown> {
    return this.chartsService.getCharts({
      csvUploadId,
      userId,
    });
  }

  @Post(':csvUploadId')
  @HttpCode(HttpStatus.CREATED)
  buildCharts(
    @Param('csvUploadId') csvUploadId: string,
    @Body() dto: BuildChartsDto,
    @UserId() userId: string,
  ): Promise<unknown> {
    return this.chartsService.buildCharts({
      csvUploadId,
      userId,
      charts: dto.charts,
    });
  }
}
