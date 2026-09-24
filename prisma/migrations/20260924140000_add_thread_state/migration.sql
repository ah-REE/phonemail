-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "tag" TEXT;

-- CreateIndex
CREATE INDEX "Email_fromUserId_toUserId_createdAt_idx" ON "Email"("fromUserId", "toUserId", "createdAt");

