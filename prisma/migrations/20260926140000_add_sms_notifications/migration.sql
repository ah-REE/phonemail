-- The "you have new mail" SMS switch, owned by the account holder.
--
-- Default TRUE is deliberate and load-bearing: every account that already exists
-- was created under the old always-on behaviour, so the migration must not
-- silently change what they receive. Only an explicit change in Settings writes
-- a false.
ALTER TABLE "User" ADD COLUMN "smsNotifications" BOOLEAN NOT NULL DEFAULT true;
