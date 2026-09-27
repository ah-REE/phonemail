-- ROUND 9: the list each fan-out row's recipient came from, stamped by the send
-- path's submission note. NULL for pairwise rows, which have no To/Cc distinction
-- to record. Additive and nullable, so existing rows stay valid.
ALTER TABLE "Email" ADD COLUMN "recipientRole" TEXT;
