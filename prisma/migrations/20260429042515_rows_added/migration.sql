/*
  Warnings:

  - You are about to drop the column `data` on the `csv_upload` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "csv_upload" DROP COLUMN "data";

-- CreateTable
CREATE TABLE "column_meta_data" (
    "id" SERIAL NOT NULL,
    "columnName" TEXT NOT NULL,
    "dataType" "ColumnDataType" NOT NULL,
    "csvUploadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "column_meta_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_row" (
    "id" SERIAL NOT NULL,
    "rowData" JSONB NOT NULL,
    "csvUploadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csv_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "column_meta_data_csvUploadId_idx" ON "column_meta_data"("csvUploadId");

-- CreateIndex
CREATE INDEX "csv_row_csvUploadId_idx" ON "csv_row"("csvUploadId");

-- AddForeignKey
ALTER TABLE "column_meta_data" ADD CONSTRAINT "column_meta_data_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_row" ADD CONSTRAINT "csv_row_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
