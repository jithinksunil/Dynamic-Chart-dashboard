-- CreateEnum
CREATE TYPE "ColumnDataType" AS ENUM ('TEXT', 'NUMBER', 'DATE_ISO');

-- CreateTable
CREATE TABLE "csv_upload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csv_upload_pkey" PRIMARY KEY ("id")
);
