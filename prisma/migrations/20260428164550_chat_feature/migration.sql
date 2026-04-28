-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AGENT';

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "chartMetaDataId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_message_chartMetaDataId_createdAt_idx" ON "chat_message"("chartMetaDataId", "createdAt");

-- CreateIndex
CREATE INDEX "chart_meta_data_csvUploadId_createdAt_idx" ON "chart_meta_data"("csvUploadId", "createdAt");

-- CreateIndex
CREATE INDEX "csv_upload_userId_createdAt_idx" ON "csv_upload"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chartMetaDataId_fkey" FOREIGN KEY ("chartMetaDataId") REFERENCES "chart_meta_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
