-- DropForeignKey
ALTER TABLE "chart_meta_data" DROP CONSTRAINT "chart_meta_data_csvUploadId_fkey";

-- DropForeignKey
ALTER TABLE "chat_message" DROP CONSTRAINT "chat_message_chartMetaDataId_fkey";

-- DropForeignKey
ALTER TABLE "column_meta_data" DROP CONSTRAINT "column_meta_data_csvUploadId_fkey";

-- DropForeignKey
ALTER TABLE "csv_row" DROP CONSTRAINT "csv_row_csvUploadId_fkey";

-- AddForeignKey
ALTER TABLE "column_meta_data" ADD CONSTRAINT "column_meta_data_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_row" ADD CONSTRAINT "csv_row_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_meta_data" ADD CONSTRAINT "chart_meta_data_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chartMetaDataId_fkey" FOREIGN KEY ("chartMetaDataId") REFERENCES "chart_meta_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;
