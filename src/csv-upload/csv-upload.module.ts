import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CsvUploadController } from './csv-upload.controller';
import { CsvUploadService } from './csv-upload.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB — safe upper bound for CSV payloads in memory
        files: 1,
        fields: 0,
      },
    }),
  ],
  controllers: [CsvUploadController],
  providers: [CsvUploadService],
})
export class CsvUploadModule {}
