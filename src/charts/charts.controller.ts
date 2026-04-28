import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChartsService } from './charts.service';
import { ChartConfigDto } from './dto/build-charts.dto';
import { UserId } from '../guards/user-id.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('chart')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get(':csvUploadId/meta')
  getChartBuilderInfo(
    @Param('csvUploadId') csvUploadId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.getChartBuilderInfo({ csvUploadId, userId });
  }

  @Get(':csvUploadId/values')
  getCharts(
    @Param('csvUploadId') csvUploadId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.getCharts({
      csvUploadId,
      userId,
    });
  }

  @Post(':csvUploadId/build')
  @HttpCode(HttpStatus.CREATED)
  buildCharts(
    @Param('csvUploadId') csvUploadId: string,
    @Body() dto: ChartConfigDto,
    @UserId() userId: string,
  ) {
    return this.chartsService.buildCharts({
      csvUploadId,
      userId,
      chartConfig: dto,
    });
  }
}
