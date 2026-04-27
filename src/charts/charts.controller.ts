import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ChartsService } from './charts.service';
import { BuildChartsDto } from './dto/build-charts.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('charts')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get(':csvUploadId')
  getCharts(
    @Param('csvUploadId') csvUploadId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.chartsService.getCharts({
      csvUploadId,
      userId: req.user.id,
    });
  }

  @Post(':csvUploadId')
  @HttpCode(HttpStatus.CREATED)
  buildCharts(
    @Param('csvUploadId') csvUploadId: string,
    @Body() dto: BuildChartsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.chartsService.buildCharts({
      csvUploadId,
      userId: req.user.id,
      charts: dto.charts,
    });
  }
}
