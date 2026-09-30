-- ROUND 30 (sender credibility): one report per reporter per reported account.
--
-- The UNIQUE pair makes "one report per reporter" a rule the database enforces,
-- so a repeat attempt is a no-op rather than a double count and an account's
-- report count is DISTINCT reporters by construction. Additive: no other table
-- changes and existing rows are untouched.

-- CreateTable
CREATE TABLE "SpamReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpamReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpamReport_reporterId_reportedUserId_key" ON "SpamReport"("reporterId", "reportedUserId");

-- CreateIndex
CREATE INDEX "SpamReport_reportedUserId_idx" ON "SpamReport"("reportedUserId");

-- AddForeignKey
ALTER TABLE "SpamReport" ADD CONSTRAINT "SpamReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpamReport" ADD CONSTRAINT "SpamReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
