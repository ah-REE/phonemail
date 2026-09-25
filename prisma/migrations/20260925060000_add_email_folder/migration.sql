-- Day 6 final: folders (Spam / Trash).
--
-- ONE column rather than three booleans: a message sits in exactly one folder,
-- so a move is a single UPDATE and "list my spam" is one indexed predicate.
--
-- 'inbox' is the default, which is what makes this migration cheap: every
-- existing row and every row the inbound path writes is already in the inbox,
-- with no backfill and no change to the delivery path.
--
-- Drafts are deliberately NOT a value here - see src/lib/folders.ts: an unsent
-- compose has no recipient yet, and an Email row requires both users, so drafts
-- live in the browser's local storage instead.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "folder" TEXT NOT NULL DEFAULT 'inbox';

-- CreateIndex
CREATE INDEX "Email_toUserId_folder_createdAt_idx" ON "Email"("toUserId", "folder", "createdAt");
