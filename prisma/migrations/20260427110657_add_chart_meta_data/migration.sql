-- CreateEnum
CREATE TYPE "ChartType" AS ENUM ('BAR', 'LINE', 'PIE');

-- CreateTable
CREATE TABLE "chart_meta_data" (
    "id" TEXT NOT NULL,
    "type" "ChartType" NOT NULL,
    "xAxis" TEXT NOT NULL,
    "yAxis" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "csvUploadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_meta_data_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "chart_meta_data" ADD CONSTRAINT "chart_meta_data_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
