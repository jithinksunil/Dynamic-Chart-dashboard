import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvUploadService } from './csv-upload.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles } from '../guards/roles.decorator';
import { UserId } from '../guards/user-id.decorator';

@UseGuards(JwtAuthGuard)
@Roles('USER')
@Controller('csv-upload')
export class CsvUploadController {
  constructor(private readonly csvUploadService: CsvUploadService) {}

  @Post('/')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @UserId() userId: string) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.csv');

    if (!isCsv) {
      throw new BadRequestException('Only CSV files are accepted');
    }

    return this.csvUploadService.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      userId,
    });
  }

  @Get('/')
  listUserCsvFiles(@UserId() userId: string) {
    return this.csvUploadService.listUserCsvFiles({ userId });
  }

  @Get('/:id/chart-builder')
  getChartBuilderInfo(@Param('id') id: string, @UserId() userId: string) {
    return this.csvUploadService.getChartBuilderInfo({ id, userId });
  }
}
