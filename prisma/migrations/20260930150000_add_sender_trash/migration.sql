-- ROUND 29 follow-up 6: the sender's own trash.
--
-- A message is ONE row both sides read, and `folder` is the RECIPIENT's
-- placement - so a sender's "Move to Trash" cannot use it. This flag marks a
-- row as sitting in its sender's trash (paired with deletedForSender, which
-- keeps it out of the sender's views): the sender's trash screens list it,
-- Empty trash clears it, Move to inbox restores it. Additive and defaulted,
-- so existing rows stay valid and recipients are untouched.
ALTER TABLE "Email" ADD COLUMN "senderTrash" BOOLEAN NOT NULL DEFAULT false;
