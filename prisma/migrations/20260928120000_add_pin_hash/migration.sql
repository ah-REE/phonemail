-- ROUND 22: the app PIN. A bcrypt hash of a four-digit lock on the INTERFACE -
-- the JWT stays the API's real boundary, and no route reads this column except the
-- pin routes themselves. NULL means "no PIN set", which is every existing account,
-- so the column is additive and nullable.
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
