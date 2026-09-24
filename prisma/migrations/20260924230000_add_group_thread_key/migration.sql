-- Day 6 group chat: the DERIVED thread key.
--
-- A multi-recipient message fans out to one Email row per recipient, and every
-- row of the same submission carries the same derived key
--     "grp:" + sha256( sorted unique [ sender, ...recipients ].join(",") )
-- so the group conversation is RECONSTRUCTED from the rows alone. There is no
-- thread table and no stored membership: a reply that names the same member set
-- lands in the same thread automatically.
--
-- Pairwise mail keeps threadKey NULL and is grouped exactly as it was before
-- Day 6, so this column changes nothing for 1:1 conversations.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "threadKey" TEXT;

-- CreateIndex
CREATE INDEX "Email_threadKey_createdAt_idx" ON "Email"("threadKey", "createdAt");
