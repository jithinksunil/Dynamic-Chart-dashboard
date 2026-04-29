import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChartsService } from './charts.service';
import { ChartConfigDto } from './dto/build-charts.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UserId } from '../guards/user-id.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Role } from '../generated/prisma/enums';
import { Roles } from '../guards/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
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

  @Get(':csvUploadId/chart-values')
  getCharts(
    @Param('csvUploadId') csvUploadId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.getCharts({
      csvUploadId,
      userId,
    });
  }

  @Post(':csvUploadId/build-chart')
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

  @Patch(':chartMetaDataId')
  @HttpCode(HttpStatus.OK)
  updateChartMetadata(
    @Param('chartMetaDataId') chartMetaDataId: string,
    @Body() dto: ChartConfigDto,
    @UserId() userId: string,
  ) {
    return this.chartsService.updateChartMetadata({
      chartMetaDataId,
      userId,
      chartConfig: dto,
    });
  }

  @Delete(':chartMetaDataId')
  @HttpCode(HttpStatus.OK)
  deleteChart(
    @Param('chartMetaDataId') chartMetaDataId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.deleteChart({ chartMetaDataId, userId });
  }

  @Throttle({ chat: { ttl: 60_000, limit: 10 } })
  @Post(':chartMetaDataId/chat')
  @HttpCode(HttpStatus.CREATED)
  sendChatMessage(
    @Param('chartMetaDataId') chartMetaDataId: string,
    @Body() dto: SendChatMessageDto,
    @UserId() userId: string,
  ) {
    return this.chartsService.sendChatMessage({
      chartMetaDataId,
      userId,
      content: dto.content,
    });
  }

  @Get(':chartMetaDataId/chat')
  getChatMessages(
    @Param('chartMetaDataId') chartMetaDataId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.getChatMessages({ chartMetaDataId, userId });
  }
}
