-- One submission id per SMTP submission, and the row a reply answers.
--
-- Both columns are nullable and both are additive: existing rows keep NULL, which
-- reads as "this row is its own submission" and "this row is not a reply". The
-- group thread's fan-out collapse and its broadcast-vs-reply visibility rule are
-- both built on exactly those two readings.
ALTER TABLE "Email" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "Email" ADD COLUMN "replyToId" TEXT;

CREATE INDEX "Email_submissionId_idx" ON "Email"("submissionId");
