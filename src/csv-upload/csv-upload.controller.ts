import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CsvUploadService } from './csv-upload.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Roles } from '../guards/roles.decorator';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard)
@Controller('csv-upload')
export class CsvUploadController {
  constructor(private readonly csvUploadService: CsvUploadService) {}

  @Post('/')
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
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
      userId: req.user.id,
    });
  }
}
