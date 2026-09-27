-- Day 9 (delete chat): PER-VIEWER deletion flags on a message.
--
-- Two flags rather than a row delete, because a message is ONE row that both sides
-- read: deleting the row would take the counterpart's copy with it. Each flag hides
-- the conversation from ONE side - its list, its thread, its unread count - and
-- leaves the other side's copy exactly where it was.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "deletedForSender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedForRecipient" BOOLEAN NOT NULL DEFAULT false;
