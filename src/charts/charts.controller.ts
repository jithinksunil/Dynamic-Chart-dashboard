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
import { ChartsService } from './charts.service';
import { ChartConfigDto } from './dto/build-charts.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
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

  @Patch(':csvUploadId/chart-meta/:chartMetaDataId')
  @HttpCode(HttpStatus.OK)
  updateChartMetadata(
    @Param('csvUploadId') csvUploadId: string,
    @Param('chartMetaDataId') chartMetaDataId: string,
    @Body() dto: ChartConfigDto,
    @UserId() userId: string,
  ) {
    return this.chartsService.updateChartMetadata({
      csvUploadId,
      chartMetaDataId,
      userId,
      chartConfig: dto,
    });
  }

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

  @Delete(':chartMetaDataId')
  @HttpCode(HttpStatus.OK)
  deleteChart(
    @Param('chartMetaDataId') chartMetaDataId: string,
    @UserId() userId: string,
  ) {
    return this.chartsService.deleteChart({ chartMetaDataId, userId });
  }
}
